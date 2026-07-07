/**
 * compandium-agent: private management API for one tenant brain.
 *
 * Wraps the gbrain operations that have no HTTP surface (sources, sync,
 * client registration) plus git-level file delivery for connectors. Reached
 * only over Fly private networking; every request needs `Authorization:
 * Bearer $AGENT_TOKEN`.
 */

import { timingSafeEqual } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, normalize, resolve } from "node:path";
import { exec, gbrain, isSafeSlug, parseRegisterClientOutput } from "./cli";

const PORT = Number(process.env.AGENT_PORT ?? 8081);
const TOKEN = process.env.AGENT_TOKEN;
const REPOS = process.env.COMPANDIUM_REPOS ?? "/data/brain-repos";
const SERVE_URL = "http://127.0.0.1:8080";

if (!TOKEN) {
  console.error("[agent] AGENT_TOKEN is not set");
  process.exit(1);
}

function authorized(req: Request): boolean {
  const header = req.headers.get("authorization") ?? "";
  const presented = header.replace(/^Bearer\s+/i, "");
  const a = Buffer.from(presented);
  const b = Buffer.from(TOKEN!);
  return a.length === b.length && timingSafeEqual(a, b);
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function badRequest(message: string): Response {
  return json({ error: message }, 400);
}

async function readBody(req: Request): Promise<Record<string, unknown>> {
  try {
    return (await req.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

// ---- department (gbrain source) operations ---------------------------------

async function createDepartment(body: Record<string, unknown>): Promise<Response> {
  const slug = body.slug;
  const name = typeof body.name === "string" && body.name.trim() ? body.name.trim() : slug;
  if (!isSafeSlug(slug)) return badRequest("invalid slug");

  const repo = join(REPOS, slug);
  if (!existsSync(repo)) {
    mkdirSync(repo, { recursive: true });
    writeFileSync(join(repo, "README.md"), `# ${name}\n`);
    for (const args of [
      ["init"],
      ["add", "-A"],
      ["commit", "-m", `Initialize ${slug} department`],
    ]) {
      const r = await exec(["git", ...args], { cwd: repo });
      if (r.code !== 0) return json({ error: "git failed", detail: r.stderr }, 500);
    }
  }

  // --federated so the department participates in members' federated reads
  const added = await gbrain([
    "sources",
    "add",
    slug,
    "--path",
    repo,
    "--name",
    String(name),
    "--federated",
  ]);
  if (added.code !== 0 && !/already exists/i.test(added.stderr + added.stdout)) {
    return json({ error: "sources add failed", detail: added.stderr || added.stdout }, 500);
  }
  return json({ ok: true, sourceId: slug, path: repo });
}

async function removeDepartment(slug: string): Promise<Response> {
  if (!isSafeSlug(slug)) return badRequest("invalid slug");
  const removed = await gbrain(["sources", "remove", slug, "--yes", "--confirm-destructive"]);
  if (removed.code !== 0) {
    return json({ error: "sources remove failed", detail: removed.stderr || removed.stdout }, 500);
  }
  return json({ ok: true });
}

async function listDepartments(): Promise<Response> {
  const r = await gbrain(["sources", "list", "--json"]);
  if (r.code !== 0) return json({ error: r.stderr || r.stdout }, 500);
  try {
    return json({ sources: JSON.parse(r.stdout) });
  } catch {
    return json({ error: "unparseable sources list", raw: r.stdout }, 500);
  }
}

// ---- sync + file delivery ---------------------------------------------------

/** Without an embedding key, sync must import-only (embed later via backfill). */
function hasEmbeddingProvider(): boolean {
  return Boolean(
    process.env.OPENAI_API_KEY ||
      process.env.ZEROENTROPY_API_KEY ||
      process.env.VOYAGE_API_KEY ||
      process.env.GBRAIN_EMBEDDING_MODEL,
  );
}

function baseSyncArgs(): string[] {
  const args = ["sync", "--no-pull", "--yes"];
  if (!hasEmbeddingProvider()) args.push("--no-embed");
  return args;
}

async function syncSource(body: Record<string, unknown>): Promise<Response> {
  const source = body.source;
  const args = baseSyncArgs();
  if (source !== undefined) {
    if (!isSafeSlug(source)) return badRequest("invalid source");
    args.push("--source", source);
  } else {
    args.push("--all");
  }
  const r = await gbrain(args, { timeoutMs: 600_000 });
  if (r.code !== 0) return json({ error: "sync failed", detail: r.stderr || r.stdout }, 500);
  return json({ ok: true, output: r.stdout.slice(-4000) });
}

interface IncomingFile {
  path: string;
  content: string;
}

async function putFiles(body: Record<string, unknown>): Promise<Response> {
  const source = body.source;
  if (!isSafeSlug(source)) return badRequest("invalid source");
  const files = body.files;
  if (!Array.isArray(files) || files.length === 0) return badRequest("files[] required");
  if (files.length > 500) return badRequest("too many files in one batch (max 500)");

  const repo = resolve(join(REPOS, source));
  if (!existsSync(join(repo, ".git"))) return badRequest("unknown department repo");

  const deletes: string[] = [];
  for (const file of files as IncomingFile[]) {
    if (typeof file?.path !== "string") return badRequest("file.path required");
    const target = resolve(join(repo, normalize(file.path)));
    if (!target.startsWith(repo + "\\") && !target.startsWith(repo + "/")) {
      return badRequest(`path escapes repo: ${file.path}`);
    }
    if (file.content === null || file.content === undefined) {
      deletes.push(target);
      continue;
    }
    if (typeof file.content !== "string") return badRequest("file.content must be a string");
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, file.content);
  }
  if (deletes.length > 0) {
    await exec(["git", "rm", "-f", "--ignore-unmatch", "--", ...deletes], { cwd: repo });
  }

  await exec(["git", "add", "-A"], { cwd: repo });
  const message = typeof body.message === "string" && body.message ? body.message : "connector sync";
  const commit = await exec(["git", "commit", "-m", message], { cwd: repo });
  const committed = commit.code === 0;
  // exit 1 with "nothing to commit" is fine — idempotent connector re-runs
  if (!committed && !/nothing to commit/i.test(commit.stdout + commit.stderr)) {
    return json({ error: "git commit failed", detail: commit.stderr || commit.stdout }, 500);
  }

  if (body.sync !== false) {
    const sync = await gbrain([...baseSyncArgs(), "--source", source], {
      timeoutMs: 600_000,
    });
    if (sync.code !== 0) {
      return json({ ok: false, committed, error: "sync failed", detail: sync.stderr.slice(-2000) }, 500);
    }
  }
  return json({ ok: true, committed, files: files.length });
}

// ---- member (OAuth client) operations ---------------------------------------

async function registerMember(body: Record<string, unknown>): Promise<Response> {
  const name = body.name;
  const source = body.source;
  const federatedRead = body.federatedRead;
  if (typeof name !== "string" || !/^[a-z0-9][a-z0-9._-]{0,63}$/.test(name)) {
    return badRequest("invalid client name");
  }
  if (!isSafeSlug(source)) return badRequest("invalid source");
  if (
    !Array.isArray(federatedRead) ||
    federatedRead.length === 0 ||
    !federatedRead.every((s) => isSafeSlug(s))
  ) {
    return badRequest("federatedRead[] required");
  }

  const r = await gbrain([
    "auth",
    "register-client",
    name,
    "--grant-types",
    "client_credentials",
    "--scopes",
    "read write",
    "--source",
    source,
    "--federated-read",
    federatedRead.join(","),
  ]);
  if (r.code !== 0) {
    return json({ error: "register-client failed", detail: r.stderr || r.stdout }, 500);
  }
  const creds = parseRegisterClientOutput(r.stdout);
  if (!creds) return json({ error: "could not parse credentials", raw: r.stdout }, 500);
  return json({ ok: true, ...creds });
}

async function revokeMember(clientId: string): Promise<Response> {
  if (!/^[A-Za-z0-9._-]{1,128}$/.test(clientId)) return badRequest("invalid client id");
  const r = await gbrain(["auth", "revoke-client", clientId]);
  if (r.code !== 0) return json({ error: "revoke failed", detail: r.stderr || r.stdout }, 500);
  return json({ ok: true });
}

// ---- health ------------------------------------------------------------------

async function health(): Promise<Response> {
  const checks: Record<string, unknown> = {};
  try {
    const res = await fetch(`${SERVE_URL}/health`, { signal: AbortSignal.timeout(5000) });
    checks.serve = { ok: res.ok, status: res.status, body: await res.json().catch(() => null) };
  } catch (e) {
    checks.serve = { ok: false, error: String(e) };
  }
  const sources = await gbrain(["sources", "status", "--json"], { timeoutMs: 30_000 });
  if (sources.code === 0) {
    try {
      checks.sources = JSON.parse(sources.stdout);
    } catch {
      checks.sources = { raw: sources.stdout.slice(0, 2000) };
    }
  } else {
    checks.sources = { error: (sources.stderr || sources.stdout).slice(0, 2000) };
  }
  const ok = (checks.serve as { ok?: boolean })?.ok === true;
  return json({ ok, checks }, ok ? 200 : 503);
}

// ---- export ------------------------------------------------------------------

async function exportDepartment(slug: string): Promise<Response> {
  if (!isSafeSlug(slug)) return badRequest("invalid slug");
  const repo = join(REPOS, slug);
  if (!existsSync(join(repo, ".git"))) return badRequest("unknown department repo");
  const bundlePath = join("/tmp", `${slug}-${Date.now()}.bundle`);
  const r = await exec(["git", "bundle", "create", bundlePath, "--all"], { cwd: repo });
  if (r.code !== 0) return json({ error: "bundle failed", detail: r.stderr }, 500);
  const file = Bun.file(bundlePath);
  return new Response(file, {
    headers: {
      "content-type": "application/octet-stream",
      "content-disposition": `attachment; filename="${slug}.bundle"`,
    },
  });
}

// ---- router ------------------------------------------------------------------

Bun.serve({
  port: PORT,
  idleTimeout: 240,
  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === "/ping") return json({ ok: true });
    if (!authorized(req)) return json({ error: "unauthorized" }, 401);

    const segments = url.pathname.split("/").filter(Boolean); // e.g. ["v1","departments","x"]
    const [v, resource, id] = segments;
    if (v !== "v1") return json({ error: "not found" }, 404);

    try {
      if (resource === "departments") {
        if (req.method === "POST" && !id) return await createDepartment(await readBody(req));
        if (req.method === "GET" && !id) return await listDepartments();
        if (req.method === "DELETE" && id) return await removeDepartment(id);
      }
      if (resource === "sync" && req.method === "POST") return await syncSource(await readBody(req));
      if (resource === "files" && req.method === "POST") return await putFiles(await readBody(req));
      if (resource === "members") {
        if (req.method === "POST" && !id) return await registerMember(await readBody(req));
        if (req.method === "DELETE" && id) return await revokeMember(id);
      }
      if (resource === "health" && req.method === "GET") return await health();
      if (resource === "export" && req.method === "GET" && id) return await exportDepartment(id);
    } catch (e) {
      console.error("[agent] handler error", e);
      return json({ error: "internal error", detail: String(e) }, 500);
    }
    return json({ error: "not found" }, 404);
  },
});

console.log(`[agent] listening on :${PORT}`);
