/**
 * Notion connector (UNVERIFIED — built against the documented API
 * https://developers.notion.com/reference, needs a real integration token
 * to validate). Imports every page shared with the integration.
 *
 * Cursor: high-water mark on last_edited_time. Blocks are converted to
 * markdown for the common types; unknown types degrade to their plain text.
 */

import { z } from "zod";
import { getJson } from "./http";
import { pathFromStableId, type FetchResult, type PullConnector, type SourceRecord } from "./types";

export const notionConfigSchema = z.object({
  integrationToken: z.string().min(20),
});
export type NotionConfig = z.infer<typeof notionConfigSchema>;

export interface NotionCursor extends Record<string, unknown> {
  lastEditedAt?: string;
}

const API = "https://api.notion.com/v1";
const NOTION_VERSION = "2022-06-28";
const MAX_PAGES = 2_000;
const MAX_BLOCK_DEPTH = 3;

function headers(token: string): Record<string, string> {
  return {
    authorization: `Bearer ${token}`,
    "notion-version": NOTION_VERSION,
    "content-type": "application/json",
  };
}

// ---- block → markdown -------------------------------------------------------

interface RichText {
  plain_text: string;
  href?: string | null;
  annotations?: { bold?: boolean; italic?: boolean; code?: boolean };
}

export function richTextToMd(rich: RichText[] | undefined): string {
  if (!rich) return "";
  return rich
    .map((r) => {
      let t = r.plain_text;
      if (r.annotations?.code) t = `\`${t}\``;
      if (r.annotations?.bold) t = `**${t}**`;
      else if (r.annotations?.italic) t = `*${t}*`;
      if (r.href) t = `[${t}](${r.href})`;
      return t;
    })
    .join("");
}

interface NotionBlock {
  id: string;
  type: string;
  has_children?: boolean;
  [key: string]: unknown;
}

export function blockToMd(block: NotionBlock, childMd: string): string {
  const data = (block[block.type] ?? {}) as { rich_text?: RichText[]; language?: string; checked?: boolean };
  const text = richTextToMd(data.rich_text);
  switch (block.type) {
    case "heading_1":
      return `# ${text}`;
    case "heading_2":
      return `## ${text}`;
    case "heading_3":
      return `### ${text}`;
    case "bulleted_list_item":
      return `- ${text}${childMd ? `\n${childMd.replace(/^/gm, "  ")}` : ""}`;
    case "numbered_list_item":
      return `1. ${text}${childMd ? `\n${childMd.replace(/^/gm, "   ")}` : ""}`;
    case "to_do":
      return `- [${data.checked ? "x" : " "}] ${text}`;
    case "code":
      return `\`\`\`${data.language ?? ""}\n${text}\n\`\`\``;
    case "quote":
      return `> ${text}`;
    case "divider":
      return "---";
    case "paragraph":
    default:
      return [text, childMd].filter(Boolean).join("\n");
  }
}

async function fetchBlocksMd(
  token: string,
  blockId: string,
  depth: number,
): Promise<string> {
  if (depth > MAX_BLOCK_DEPTH) return "";
  const parts: string[] = [];
  let cursor: string | undefined;
  do {
    const url = new URL(`${API}/blocks/${blockId}/children`);
    url.searchParams.set("page_size", "100");
    if (cursor) url.searchParams.set("start_cursor", cursor);
    const page = await getJson<{
      results: NotionBlock[];
      has_more: boolean;
      next_cursor: string | null;
    }>(url.toString(), { headers: headers(token), errorLabel: "notion blocks" });
    for (const block of page.results) {
      const childMd = block.has_children ? await fetchBlocksMd(token, block.id, depth + 1) : "";
      parts.push(blockToMd(block, childMd));
    }
    cursor = page.has_more ? (page.next_cursor ?? undefined) : undefined;
  } while (cursor);
  return parts.filter((p) => p.trim()).join("\n\n");
}

interface NotionPage {
  id: string;
  object: string;
  last_edited_time: string;
  url?: string;
  properties?: Record<string, { type: string; title?: RichText[] }>;
}

export function pageTitle(page: NotionPage): string {
  for (const prop of Object.values(page.properties ?? {})) {
    if (prop.type === "title" && prop.title) return richTextToMd(prop.title) || "Untitled";
  }
  return "Untitled";
}

export const notionConnector: PullConnector<NotionConfig, NotionCursor> = {
  type: "notion",
  mode: "pull",
  configSchema: notionConfigSchema,

  async validate(config) {
    await getJson(`${API}/users/me`, {
      headers: headers(config.integrationToken),
      errorLabel: "notion token check",
    });
  },

  async fetch(config, cursor): Promise<FetchResult<NotionCursor>> {
    const token = config.integrationToken;
    const since = cursor?.lastEditedAt;
    const pages: NotionPage[] = [];
    let searchCursor: string | undefined;

    do {
      const body: Record<string, unknown> = {
        filter: { property: "object", value: "page" },
        sort: { direction: "descending", timestamp: "last_edited_time" },
        page_size: 100,
        ...(searchCursor ? { start_cursor: searchCursor } : {}),
      };
      const result = await getJson<{
        results: NotionPage[];
        has_more: boolean;
        next_cursor: string | null;
      }>(`${API}/search`, {
        method: "POST",
        headers: headers(token),
        body: JSON.stringify(body),
        errorLabel: "notion search",
      });
      let done = false;
      for (const page of result.results) {
        // results are newest-first: stop at the high-water mark
        if (since && page.last_edited_time <= since) {
          done = true;
          break;
        }
        pages.push(page);
        if (pages.length >= MAX_PAGES) {
          done = true;
          break;
        }
      }
      searchCursor = !done && result.has_more ? (result.next_cursor ?? undefined) : undefined;
    } while (searchCursor);

    const records: SourceRecord[] = [];
    for (const page of pages) {
      const title = pageTitle(page);
      const body = await fetchBlocksMd(token, page.id, 0);
      records.push({
        stableId: page.id,
        path: pathFromStableId("notion", page.id),
        markdown: `# ${title}\n\n${body}`,
        metadata: { origin: page.url ?? `notion:${page.id}`, notion_last_edited: page.last_edited_time },
      });
    }

    const newest = pages[0]?.last_edited_time ?? since;
    return {
      records,
      nextCursor: { lastEditedAt: newest },
      stats: { imported: records.length },
    };
  },
};
