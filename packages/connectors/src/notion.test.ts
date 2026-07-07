import { afterEach, describe, expect, test } from "bun:test";
import { setHttpFetch } from "./http";
import { blockToMd, notionConnector, pageTitle, richTextToMd } from "./notion";

let restore: (() => void) | null = null;
afterEach(() => restore?.());

function jsonResponse(data: unknown): Response {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

const rt = (text: string) => [{ plain_text: text }];

describe("richTextToMd", () => {
  test("annotations and links", () => {
    expect(
      richTextToMd([
        { plain_text: "bold", annotations: { bold: true } },
        { plain_text: " and " },
        { plain_text: "linked", href: "https://x.y" },
      ]),
    ).toBe("**bold** and [linked](https://x.y)");
  });
});

describe("blockToMd", () => {
  test("headings, todos, code", () => {
    expect(blockToMd({ id: "1", type: "heading_2", heading_2: { rich_text: rt("Title") } }, "")).toBe("## Title");
    expect(blockToMd({ id: "2", type: "to_do", to_do: { rich_text: rt("ship"), checked: true } }, "")).toBe("- [x] ship");
    expect(blockToMd({ id: "3", type: "code", code: { rich_text: rt("x=1"), language: "python" } }, "")).toBe("```python\nx=1\n```");
  });
});

describe("notionConnector.fetch", () => {
  test("imports pages newer than the cursor, converts blocks", async () => {
    const page = {
      id: "abc-123",
      object: "page",
      last_edited_time: "2026-07-01T00:00:00.000Z",
      url: "https://notion.so/abc123",
      properties: { Name: { type: "title", title: rt("Runbook") } },
    };
    restore = setHttpFetch(async (url, init) => {
      if (url.includes("/search")) {
        return jsonResponse({ results: [page], has_more: false, next_cursor: null });
      }
      if (url.includes("/blocks/abc-123/children")) {
        return jsonResponse({
          results: [
            { id: "b1", type: "heading_1", heading_1: { rich_text: rt("Overview") } },
            { id: "b2", type: "paragraph", paragraph: { rich_text: rt("The limit is 1000 rps.") } },
          ],
          has_more: false,
          next_cursor: null,
        });
      }
      throw new Error(`unexpected url ${url} ${init?.method ?? "GET"}`);
    });

    const result = await notionConnector.fetch(
      { integrationToken: "secret_test_token_1234567890" },
      { lastEditedAt: "2026-06-01T00:00:00.000Z" },
    );
    expect(result.records).toHaveLength(1);
    expect(result.records[0]!.path).toBe("notion/abc-123.md");
    expect(result.records[0]!.markdown).toContain("# Runbook");
    expect(result.records[0]!.markdown).toContain("# Overview");
    expect(result.records[0]!.markdown).toContain("1000 rps");
    expect(result.nextCursor.lastEditedAt).toBe("2026-07-01T00:00:00.000Z");
  });

  test("stops at the high-water mark", async () => {
    restore = setHttpFetch(async (url) => {
      if (url.includes("/search")) {
        return jsonResponse({
          results: [
            { id: "old", object: "page", last_edited_time: "2026-05-01T00:00:00.000Z", properties: {} },
          ],
          has_more: false,
          next_cursor: null,
        });
      }
      throw new Error("blocks should not be fetched for stale pages");
    });
    const result = await notionConnector.fetch(
      { integrationToken: "secret_test_token_1234567890" },
      { lastEditedAt: "2026-06-01T00:00:00.000Z" },
    );
    expect(result.records).toHaveLength(0);
  });
});

describe("pageTitle", () => {
  test("finds the title property", () => {
    expect(
      pageTitle({
        id: "x",
        object: "page",
        last_edited_time: "",
        properties: { T: { type: "title", title: rt("Hello") } },
      }),
    ).toBe("Hello");
  });
});
