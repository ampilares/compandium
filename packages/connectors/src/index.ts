import { z } from "zod";
import { gdriveConnector } from "./gdrive";
import { gitConnector } from "./git";
import { notionConnector } from "./notion";
import { slackConnector } from "./slack";
import type { PullConnector, PushConnector } from "./types";

export { pathFromStableId } from "./types";
export type { FetchResult, PullConnector, PushConnector, SourceRecord } from "./types";
export { gitConnector, gitConfigSchema, type GitConfig, type GitCursor } from "./git";
export { notionConnector, notionConfigSchema, type NotionConfig } from "./notion";
export { slackConnector, slackConfigSchema, type SlackConfig } from "./slack";
export { gdriveConnector, gdriveConfigSchema, type GdriveConfig } from "./gdrive";
export { setHttpFetch } from "./http";

/** Markdown file upload from the dashboard (handled by a web route). */
export const uploadConnector: PushConnector<{ note?: string }> = {
  type: "upload",
  mode: "push",
  configSchema: z.object({ note: z.string().max(500).optional() }),
};

/** Generic inbound webhook (Zapier/IFTTT/Shortcuts → department). */
export const webhookConfigSchema = z.object({
  /** shared secret carried in the webhook URL */
  token: z.string().min(24),
});
export const webhookConnector: PushConnector<z.infer<typeof webhookConfigSchema>> = {
  type: "webhook",
  mode: "push",
  configSchema: webhookConfigSchema,
};

export const PULL_CONNECTORS: Record<string, PullConnector<never, never>> = {
  git: gitConnector as unknown as PullConnector<never, never>,
  notion: notionConnector as unknown as PullConnector<never, never>,
  slack: slackConnector as unknown as PullConnector<never, never>,
  gdrive: gdriveConnector as unknown as PullConnector<never, never>,
};

export const PUSH_CONNECTORS: Record<string, PushConnector<unknown>> = {
  upload: uploadConnector,
  webhook: webhookConnector as PushConnector<unknown>,
};

export function isPullType(type: string): boolean {
  return type in PULL_CONNECTORS;
}
