import { afterEach, describe, expect, test } from "bun:test";
import { setHttpFetch } from "./http";
import { dayOf, renderDay, slackConnector } from "./slack";

let restore: (() => void) | null = null;
afterEach(() => restore?.());

function jsonResponse(data: unknown): Response {
  return new Response(JSON.stringify(data), { status: 200 });
}

describe("dayOf", () => {
  test("converts slack ts to UTC date", () => {
    expect(dayOf("1751328000.000100")).toBe("2025-07-01");
  });
});

describe("renderDay", () => {
  test("renders a digest with resolved names", () => {
    const md = renderDay(
      "eng",
      "2026-07-01",
      [
        { ts: "1782000000.1", user: "U1", text: "shipped the fix" },
        { ts: "1781996400.1", user: "U2", text: "reviewing now" },
      ],
      new Map([
        ["U1", "Dana"],
        ["U2", "Lee"],
      ]),
    );
    expect(md).toContain("# #eng — 2026-07-01");
    expect(md.indexOf("Lee")).toBeLessThan(md.indexOf("Dana")); // sorted by ts
    expect(md).toContain("**");
  });
});

describe("slackConnector.fetch", () => {
  test("groups new messages into full-day digests", async () => {
    const ts1 = String(Date.parse("2026-07-01T10:00:00Z") / 1000) + ".000100";
    restore = setHttpFetch(async (url) => {
      if (url.includes("conversations.info")) {
        return jsonResponse({ ok: true, channel: { name: "eng" } });
      }
      if (url.includes("conversations.history")) {
        return jsonResponse({
          ok: true,
          messages: [{ ts: ts1, user: "U1", text: "hello world" }],
        });
      }
      if (url.includes("users.info")) {
        return jsonResponse({ ok: true, user: { real_name: "Dana" } });
      }
      throw new Error(`unexpected ${url}`);
    });

    const result = await slackConnector.fetch(
      { botToken: "xoxb-test", channelId: "C012345678" },
      null,
    );
    expect(result.records).toHaveLength(1);
    expect(result.records[0]!.path).toBe("slack/eng/2026-07-01.md");
    expect(result.records[0]!.markdown).toContain("Dana");
    expect(result.nextCursor.latestTs).toBe(ts1);
  });

  test("no new messages = no records", async () => {
    restore = setHttpFetch(async (url) => {
      if (url.includes("conversations.history")) return jsonResponse({ ok: true, messages: [] });
      return jsonResponse({ ok: true, channel: { name: "eng" } });
    });
    const result = await slackConnector.fetch(
      { botToken: "xoxb-test", channelId: "C012345678" },
      { latestTs: "1751328000.000100", channelName: "eng" },
    );
    expect(result.records).toHaveLength(0);
    expect(result.stats?.unchanged).toBe(1);
  });
});
