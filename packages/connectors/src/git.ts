/**
 * Git repo import: shallow-clones a repo, imports every markdown file under
 * the optional subdir. Incremental: skips work when the remote head hasn't
 * moved; prunes files that disappeared upstream (tracked in the cursor).
 */

import { execFile } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { z } from "zod";
import type { FetchResult, PullConnector, SourceRecord } from "./types";

export const gitConfigSchema = z.object({
  repoUrl: z
    .string()
    .url()
    .refine((u) => u.startsWith("https://"), "only https:// repo URLs are supported"),
  branch: z.string().regex(/^[\w./-]+$/).optional(),
  /** import only files under this repo subdirectory */
  subdir: z
    .string()
    .regex(/^[\w./-]*$/)
    .refine((s) => !s.split("/").includes(".."), "no .. segments")
    .optional(),
});

export type GitConfig = z.infer<typeof gitConfigSchema>;

export interface GitCursor extends Record<string, unknown> {
  lastCommit?: string;
  /** repo-relative markdown paths seen in the last run (for prune) */
  seenPaths?: string[];
}

const MAX_FILE_BYTES = 1_000_000;
const MAX_FILES = 5_000;

function git(
  args: string[],
  cwd?: string,
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    execFile(
      "git",
      args,
      {
        cwd,
        env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
        maxBuffer: 16 * 1024 * 1024,
        timeout: 120_000,
      },
      (err, stdout, stderr) => {
        let code = 0;
        if (err) {
          const raw = (err as { code?: unknown }).code;
          code = typeof raw === "number" ? raw : 1;
        }
        resolve({ code, stdout: String(stdout).trim(), stderr: String(stderr).trim() });
      },
    );
  });
}

function walkMarkdown(root: string): string[] {
  const out: string[] = [];
  const stack = [root];
  while (stack.length > 0 && out.length < MAX_FILES) {
    const dir = stack.pop()!;
    for (const entry of readdirSync(dir)) {
      if (entry === ".git") continue;
      const full = join(dir, entry);
      const stat = statSync(full);
      if (stat.isDirectory()) stack.push(full);
      else if (/\.(md|markdown)$/i.test(entry) && stat.size <= MAX_FILE_BYTES) out.push(full);
    }
  }
  return out;
}

export const gitConnector: PullConnector<GitConfig, GitCursor> = {
  type: "git",
  mode: "pull",
  configSchema: gitConfigSchema,

  async validate(config) {
    const r = await git(["ls-remote", "--heads", config.repoUrl]);
    if (r.code !== 0) throw new Error(`repository unreachable: ${r.stderr.slice(0, 300)}`);
    if (config.branch && !r.stdout.includes(`refs/heads/${config.branch}`)) {
      throw new Error(`branch "${config.branch}" not found`);
    }
  },

  async fetch(config, cursor): Promise<FetchResult<GitCursor>> {
    // cheap head check first — most runs are no-ops
    const refArg = config.branch ? `refs/heads/${config.branch}` : "HEAD";
    const head = await git(["ls-remote", config.repoUrl, refArg]);
    if (head.code !== 0) throw new Error(`ls-remote failed: ${head.stderr.slice(0, 300)}`);
    const remoteCommit = head.stdout.split(/\s+/)[0];
    if (remoteCommit && cursor?.lastCommit === remoteCommit) {
      return { records: [], nextCursor: cursor, stats: { unchanged: 1 } };
    }

    const tmp = mkdtempSync(join(tmpdir(), "cpd-git-"));
    try {
      const cloneArgs = ["clone", "--depth", "1", "--single-branch"];
      if (config.branch) cloneArgs.push("--branch", config.branch);
      cloneArgs.push(config.repoUrl, tmp);
      const clone = await git(cloneArgs);
      if (clone.code !== 0) throw new Error(`clone failed: ${clone.stderr.slice(0, 300)}`);

      const scanRoot = config.subdir ? join(tmp, config.subdir) : tmp;
      let files: string[] = [];
      try {
        files = walkMarkdown(scanRoot);
      } catch {
        throw new Error(`subdir "${config.subdir}" not found in the repository`);
      }

      const records: SourceRecord[] = files.map((full) => {
        const rel = relative(tmp, full).replaceAll("\\", "/");
        return {
          stableId: rel,
          path: rel,
          markdown: readFileSync(full, "utf8"),
          metadata: { origin: config.repoUrl, commit: remoteCommit },
        };
      });

      // prune files that disappeared upstream since the last run
      const currentPaths = new Set(records.map((r) => r.path));
      for (const seen of cursor?.seenPaths ?? []) {
        if (!currentPaths.has(seen)) {
          records.push({ stableId: seen, path: seen, markdown: null });
        }
      }

      return {
        records,
        nextCursor: { lastCommit: remoteCommit, seenPaths: [...currentPaths] },
        stats: { imported: currentPaths.size, pruned: records.length - currentPaths.size },
      };
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  },
};
