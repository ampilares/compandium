import type { z } from "zod";

/**
 * One record from an external source, mapped to a markdown file inside the
 * bound department repo. Shape modeled on Vitrus's connector framework
 * (stable id + content + incremental prune).
 */
export interface SourceRecord {
  /** stable external id — dedupe/update key across runs (becomes the file path) */
  stableId: string;
  /** repo-relative markdown path, derived deterministically from stableId */
  path: string;
  /** markdown body; null = delete (pruned upstream) */
  markdown: string | null;
  /** merged into frontmatter */
  metadata?: Record<string, unknown>;
}

export interface FetchResult<Cursor = Record<string, unknown>> {
  records: SourceRecord[];
  /** persisted on success and passed to the next run */
  nextCursor: Cursor;
  /** human-readable run summary for the run history */
  stats?: Record<string, number>;
}

export interface PullConnector<Cfg = unknown, Cursor = Record<string, unknown>> {
  readonly type: string;
  /** How the connector gets data: pull = worker-scheduled fetch. */
  readonly mode: "pull";
  readonly configSchema: z.ZodType<Cfg>;
  /** cheap validation at setup time (credentials/reachability) */
  validate(config: Cfg): Promise<void>;
  fetch(config: Cfg, cursor: Cursor | null): Promise<FetchResult<Cursor>>;
}

/** Push connectors (upload, webhook) receive data via web routes instead. */
export interface PushConnector<Cfg = unknown> {
  readonly type: string;
  readonly mode: "push";
  readonly configSchema: z.ZodType<Cfg>;
}

export type Connector = PullConnector<never, never> | PushConnector<unknown>;

/** Make an arbitrary external id safe as a repo-relative markdown path. */
export function pathFromStableId(prefix: string, stableId: string): string {
  const safe = stableId
    .replace(/\.md$/i, "")
    .replace(/[^a-zA-Z0-9/_-]+/g, "-")
    .replace(/\/+/g, "/")
    .replace(/(^|\/)\.+(?=\/|$)/g, "$1") // strip . / .. segments
    .replace(/^\/+|\/+$/g, "")
    .slice(0, 180);
  return `${prefix}/${safe || "item"}.md`;
}
