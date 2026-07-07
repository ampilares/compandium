/** Helpers for driving the gbrain CLI and git from the agent. */

export interface CmdResult {
  code: number;
  stdout: string;
  stderr: string;
}

export async function exec(
  cmd: string[],
  opts: { cwd?: string; timeoutMs?: number } = {},
): Promise<CmdResult> {
  const proc = Bun.spawn(cmd, {
    cwd: opts.cwd,
    env: process.env as Record<string, string>,
    stdout: "pipe",
    stderr: "pipe",
  });
  const timeoutMs = opts.timeoutMs ?? 300_000;
  const timer = setTimeout(() => proc.kill("SIGKILL"), timeoutMs);
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  clearTimeout(timer);
  return { code, stdout, stderr };
}

export async function gbrain(args: string[], opts: { timeoutMs?: number } = {}): Promise<CmdResult> {
  return exec(["gbrain", ...args], opts);
}

/** Parse `gbrain auth register-client` human output into credentials. */
export function parseRegisterClientOutput(stdout: string): {
  clientId: string;
  clientSecret: string;
} | null {
  const idMatch = stdout.match(/Client ID:\s+(\S+)/);
  const secretMatch = stdout.match(/Client Secret:\s+(\S+)/);
  if (!idMatch?.[1] || !secretMatch?.[1] || secretMatch[1].startsWith("<")) return null;
  return { clientId: idMatch[1], clientSecret: secretMatch[1] };
}

export const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?$/;

export function isSafeSlug(slug: unknown): slug is string {
  return typeof slug === "string" && SLUG_RE.test(slug);
}
