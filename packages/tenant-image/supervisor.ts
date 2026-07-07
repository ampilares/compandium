/**
 * Tenant supervisor: brings up Postgres, bootstraps the gbrain brain on first
 * boot, then runs `gbrain serve --http` (public) and the compandium-agent
 * (private) — restarting either if it dies. PID 1 of the tenant container.
 *
 * Required env: AGENT_TOKEN, GBRAIN_ADMIN_BOOTSTRAP_TOKEN, PUBLIC_URL
 * Optional env: OPENAI_API_KEY / ANTHROPIC_API_KEY (AI providers),
 *               GBRAIN_EMBEDDING_MODEL (default openai:text-embedding-3-small
 *               when OPENAI_API_KEY is set, otherwise embedding is deferred)
 */

import { mkdirSync, existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const DATA = process.env.COMPANDIUM_DATA ?? "/data";
const PGDATA = process.env.PGDATA ?? join(DATA, "pgdata");
const HOME = join(DATA, "home");
const REPOS = join(DATA, "brain-repos");
const BOOTSTRAP_MARKER = join(HOME, ".compandium-bootstrapped");
const DB_URL = "postgres://gbrain:gbrain@127.0.0.1:5432/brain";
const SERVE_PORT = 8080;
const AGENT_PORT = 8081;

for (const name of ["AGENT_TOKEN", "GBRAIN_ADMIN_BOOTSTRAP_TOKEN", "PUBLIC_URL"]) {
  if (!process.env[name]) {
    console.error(`[supervisor] missing required env: ${name}`);
    process.exit(1);
  }
}

const childEnv = {
  ...process.env,
  HOME,
  GBRAIN_DATABASE_URL: DB_URL,
  COMPANDIUM_REPOS: REPOS,
} satisfies Record<string, string | undefined>;

async function run(
  cmd: string[],
  opts: { cwd?: string; allowFail?: boolean; quiet?: boolean } = {},
): Promise<{ code: number; stdout: string; stderr: string }> {
  const proc = Bun.spawn(cmd, {
    cwd: opts.cwd,
    env: childEnv,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  if (code !== 0 && !opts.allowFail) {
    console.error(`[supervisor] command failed (${code}): ${cmd.join(" ")}`);
    console.error(stderr || stdout);
    throw new Error(`command failed: ${cmd[0]}`);
  }
  if (!opts.quiet && stdout.trim()) console.log(stdout.trim());
  return { code, stdout, stderr };
}

async function waitForPostgres(timeoutMs = 60_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const { code } = await run(["pg_isready", "-h", "127.0.0.1", "-p", "5432"], {
      allowFail: true,
      quiet: true,
    });
    if (code === 0) return;
    await Bun.sleep(500);
  }
  throw new Error("postgres did not become ready in time");
}

function startPostgres(): ReturnType<typeof Bun.spawn> {
  console.log("[supervisor] starting postgres");
  return Bun.spawn(
    [
      "gosu",
      "postgres",
      "postgres",
      "-D",
      PGDATA,
      "-c",
      "listen_addresses=127.0.0.1",
    ],
    { env: childEnv, stdout: "inherit", stderr: "inherit" },
  );
}

async function initDatabase(): Promise<void> {
  if (!existsSync(join(PGDATA, "PG_VERSION"))) {
    console.log("[supervisor] initdb");
    mkdirSync(PGDATA, { recursive: true });
    await run(["chown", "-R", "postgres:postgres", PGDATA]);
    await run(["gosu", "postgres", "initdb", "-D", PGDATA]);
  }
}

async function ensureRoleAndDb(): Promise<void> {
  const psql = (sql: string) =>
    run(["gosu", "postgres", "psql", "-h", "127.0.0.1", "-tAc", sql], { allowFail: true, quiet: true });
  const role = await psql("SELECT 1 FROM pg_roles WHERE rolname='gbrain'");
  if (!role.stdout.includes("1")) {
    // SUPERUSER: gbrain's migrations create event triggers and enable RLS,
    // which need superuser. This Postgres lives inside the tenant container
    // and serves exactly this one brain, so the role owns the whole box.
    await psql("CREATE ROLE gbrain LOGIN PASSWORD 'gbrain' SUPERUSER");
  } else {
    await psql("ALTER ROLE gbrain SUPERUSER");
  }
  const db = await psql("SELECT 1 FROM pg_database WHERE datname='brain'");
  if (!db.stdout.includes("1")) {
    await psql("CREATE DATABASE brain OWNER gbrain");
  }
  await run(
    ["gosu", "postgres", "psql", "-h", "127.0.0.1", "-d", "brain", "-c", "CREATE EXTENSION IF NOT EXISTS vector"],
    { allowFail: true, quiet: true },
  );
}

function embeddingArgs(): string[] {
  const explicit = process.env.GBRAIN_EMBEDDING_MODEL;
  if (explicit) return ["--embedding-model", explicit];
  if (process.env.OPENAI_API_KEY) {
    return ["--embedding-model", "openai:text-embedding-3-small"];
  }
  // BYO-later mode: brain works for capture/sync; embedding configured when
  // the org adds a key (gbrain config set embedding_model ...).
  return ["--no-embedding"];
}

async function bootstrapBrain(): Promise<void> {
  if (existsSync(BOOTSTRAP_MARKER)) return;
  console.log("[supervisor] first boot: bootstrapping brain");

  await run(["git", "config", "--global", "user.email", "agent@compandium.app"]);
  await run(["git", "config", "--global", "user.name", "Compandium Agent"]);
  await run(["git", "config", "--global", "init.defaultBranch", "main"]);

  await run([
    "gbrain",
    "init",
    "--non-interactive",
    "--url",
    DB_URL,
    "--skip-embed-check",
    ...embeddingArgs(),
  ]);

  // Default department: "shared" (everyone can read it).
  const sharedRepo = join(REPOS, "shared");
  if (!existsSync(sharedRepo)) {
    mkdirSync(sharedRepo, { recursive: true });
    writeFileSync(
      join(sharedRepo, "README.md"),
      "# Shared\n\nCompany-wide knowledge. Everyone in the workspace can read this department.\n",
    );
    await run(["git", "init"], { cwd: sharedRepo });
    await run(["git", "add", "-A"], { cwd: sharedRepo });
    await run(["git", "commit", "-m", "Initialize shared department"], { cwd: sharedRepo });
  }
  // --federated: departments must participate in federated reads — that is
  // how member OAuth clients' --federated-read scoping reaches them.
  await run(
    ["gbrain", "sources", "add", "shared", "--path", sharedRepo, "--name", "Shared", "--federated"],
    { allowFail: true },
  );
  const syncArgs = ["gbrain", "sync", "--source", "shared", "--no-pull", "--yes"];
  if (embeddingArgs()[0] === "--no-embedding") syncArgs.push("--no-embed");
  await run(syncArgs, { allowFail: true });

  writeFileSync(BOOTSTRAP_MARKER, new Date().toISOString());
  console.log("[supervisor] bootstrap complete");
}

/** Keep a child process alive with exponential backoff, propagate shutdown. */
function supervise(name: string, spawnChild: () => ReturnType<typeof Bun.spawn>): void {
  let backoffMs = 1000;
  const loop = async () => {
    for (;;) {
      const started = Date.now();
      const proc = spawnChild();
      children.set(name, proc);
      const code = await proc.exited;
      children.delete(name);
      if (shuttingDown) return;
      if (Date.now() - started > 60_000) backoffMs = 1000;
      console.error(`[supervisor] ${name} exited (${code}); restarting in ${backoffMs}ms`);
      await Bun.sleep(backoffMs);
      backoffMs = Math.min(backoffMs * 2, 30_000);
    }
  };
  void loop();
}

const children = new Map<string, ReturnType<typeof Bun.spawn>>();
let shuttingDown = false;

function shutdown(signal: string): void {
  console.log(`[supervisor] ${signal} received; shutting down`);
  shuttingDown = true;
  for (const [, proc] of children) proc.kill("SIGTERM");
  setTimeout(() => process.exit(0), 5000);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

// ---- main ------------------------------------------------------------------

mkdirSync(HOME, { recursive: true });
mkdirSync(REPOS, { recursive: true });

await initDatabase();
const pg = startPostgres();
children.set("postgres", pg);
void pg.exited.then((code) => {
  if (!shuttingDown) {
    console.error(`[supervisor] postgres exited unexpectedly (${code}); container will restart`);
    process.exit(1);
  }
});

await waitForPostgres();
await ensureRoleAndDb();
await bootstrapBrain();

supervise("gbrain-serve", () =>
  Bun.spawn(
    [
      "gbrain",
      "serve",
      "--http",
      "--port",
      String(SERVE_PORT),
      "--bind",
      "0.0.0.0",
      "--public-url",
      process.env.PUBLIC_URL!,
    ],
    { env: childEnv, stdout: "inherit", stderr: "inherit" },
  ),
);

supervise("agent", () =>
  Bun.spawn(["bun", "run", "/opt/compandium/agent/server.ts"], {
    env: { ...childEnv, AGENT_PORT: String(AGENT_PORT) },
    stdout: "inherit",
    stderr: "inherit",
  }),
);

console.log(
  `[supervisor] up — gbrain :${SERVE_PORT} (public), agent :${AGENT_PORT} (private)`,
);
