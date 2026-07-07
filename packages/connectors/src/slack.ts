/**
 * Slack connector (UNVERIFIED — built against the documented Web API
 * https://api.slack.com/methods, needs a bot token to validate).
 * Archives one public channel into daily digest files.
 *
 * Config: bot token (xoxb-…, scopes channels:read + channels:history +
 * users:read) and a channel id. Cursor: newest message ts seen. Days that
 * receive new messages are re-rendered whole so each file stays a complete
 * daily digest.
 */

import { z } from "zod";
import { getJson } from "./http";
import type { FetchResult, PullConnector, SourceRecord } from "./types";

export const slackConfigSchema = z.object({
  botToken: z.string().regex(/^xox[bp]-/, "expected a bot token (xoxb-…)"),
  channelId: z.string().regex(/^[CG][A-Z0-9]{6,}$/, "expected a channel id like C0123456789"),
});
export type SlackConfig = z.infer<typeof slackConfigSchema>;

export interface SlackCursor extends Record<string, unknown> {
  latestTs?: string;
  channelName?: string;
}

const API = "https://slack.com/api";
const MAX_MESSAGES_PER_RUN = 5_000;

interface SlackMessage {
  ts: string;
  user?: string;
  bot_id?: string;
  text?: string;
  subtype?: string;
  thread_ts?: string;
}

async function slackCall<T extends { ok: boolean; error?: string }>(
  token: string,
  method: string,
  params: Record<string, string>,
): Promise<T> {
  const url = new URL(`${API}/${method}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const result = await getJson<T>(url.toString(), {
    headers: { authorization: `Bearer ${token}` },
    errorLabel: `slack ${method}`,
  });
  if (!result.ok) throw new Error(`slack ${method}: ${result.error ?? "unknown error"}`);
  return result;
}

export function dayOf(ts: string): string {
  return new Date(Number(ts.split(".")[0]) * 1000).toISOString().slice(0, 10);
}

export function renderDay(
  channelName: string,
  day: string,
  messages: SlackMessage[],
  userNames: Map<string, string>,
): string {
  const lines = messages
    .filter((m) => !m.subtype || m.subtype === "thread_broadcast")
    .sort((a, b) => Number(a.ts) - Number(b.ts))
    .map((m) => {
      const time = new Date(Number(m.ts.split(".")[0]) * 1000).toISOString().slice(11, 16);
      const who = m.user ? (userNames.get(m.user) ?? m.user) : (m.bot_id ?? "bot");
      const text = (m.text ?? "").replace(/\r?\n/g, "\n  ");
      return `- **${time} ${who}:** ${text}`;
    });
  return `# #${channelName} — ${day}\n\n${lines.join("\n")}\n`;
}

export const slackConnector: PullConnector<SlackConfig, SlackCursor> = {
  type: "slack",
  mode: "pull",
  configSchema: slackConfigSchema,

  async validate(config) {
    await slackCall(config.botToken, "auth.test", {});
    await slackCall(config.botToken, "conversations.info", { channel: config.channelId });
  },

  async fetch(config, cursor): Promise<FetchResult<SlackCursor>> {
    const { botToken, channelId } = config;

    let channelName = cursor?.channelName;
    if (!channelName) {
      const info = await slackCall<{ ok: boolean; channel?: { name?: string } }>(
        botToken,
        "conversations.info",
        { channel: channelId },
      );
      channelName = info.channel?.name ?? channelId;
    }

    // pull everything newer than the cursor
    const messages: SlackMessage[] = [];
    let pageCursor: string | undefined;
    do {
      const params: Record<string, string> = { channel: channelId, limit: "200" };
      if (cursor?.latestTs) params.oldest = cursor.latestTs;
      if (pageCursor) params.cursor = pageCursor;
      const page = await slackCall<{
        ok: boolean;
        messages?: SlackMessage[];
        response_metadata?: { next_cursor?: string };
      }>(botToken, "conversations.history", params);
      messages.push(...(page.messages ?? []));
      pageCursor = page.response_metadata?.next_cursor || undefined;
    } while (pageCursor && messages.length < MAX_MESSAGES_PER_RUN);

    if (messages.length === 0) {
      return { records: [], nextCursor: { ...cursor, channelName }, stats: { unchanged: 1 } };
    }

    // resolve author names once per run
    const userIds = [...new Set(messages.map((m) => m.user).filter((u): u is string => !!u))];
    const userNames = new Map<string, string>();
    for (const userId of userIds.slice(0, 200)) {
      try {
        const info = await slackCall<{ ok: boolean; user?: { real_name?: string; name?: string } }>(
          botToken,
          "users.info",
          { user: userId },
        );
        userNames.set(userId, info.user?.real_name || info.user?.name || userId);
      } catch {
        userNames.set(userId, userId);
      }
    }

    // Re-render each touched day as a COMPLETE digest: a new message on an
    // already-written day must not clobber the file with a partial view, so
    // re-fetch the whole day window before rendering.
    const touchedDays = [...new Set(messages.map((m) => dayOf(m.ts)))];
    const records: SourceRecord[] = [];
    for (const day of touchedDays) {
      const dayStart = String(Date.parse(`${day}T00:00:00Z`) / 1000);
      const dayEnd = String(Date.parse(`${day}T00:00:00Z`) / 1000 + 86_400);
      const full = await slackCall<{ ok: boolean; messages?: SlackMessage[] }>(
        botToken,
        "conversations.history",
        { channel: channelId, oldest: dayStart, latest: dayEnd, limit: "1000", inclusive: "true" },
      );
      records.push({
        stableId: `${channelId}/${day}`,
        path: `slack/${channelName}/${day}.md`,
        markdown: renderDay(channelName!, day, full.messages ?? [], userNames),
        metadata: { origin: `slack:#${channelName}`, day },
      });
    }

    const newestTs = messages.reduce((max, m) => (Number(m.ts) > Number(max) ? m.ts : max), cursor?.latestTs ?? "0");
    return {
      records,
      nextCursor: { latestTs: newestTs, channelName },
      stats: { messages: messages.length, days: records.length },
    };
  },
};
