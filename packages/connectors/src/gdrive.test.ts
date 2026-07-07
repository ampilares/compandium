import { afterEach, describe, expect, test } from "bun:test";
import { gdriveConnector } from "./gdrive";
import { setHttpFetch } from "./http";

let restore: (() => void) | null = null;
afterEach(() => restore?.());

const config = {
  clientId: "client-id-123",
  clientSecret: "client-secret-123",
  refreshToken: "refresh-token-123",
  folderId: "folder123456",
};

describe("gdriveConnector.fetch", () => {
  test("refreshes token, lists docs, exports as markdown", async () => {
    restore = setHttpFetch(async (url, init) => {
      if (url.includes("oauth2.googleapis.com/token")) {
        expect(init?.method).toBe("POST");
        return new Response(JSON.stringify({ access_token: "at-1" }), { status: 200 });
      }
      if (url.includes("/files/doc1/export")) {
        return new Response("# Quarterly plan\n\nGrow revenue.", { status: 200 });
      }
      if (url.includes("/files?")) {
        return new Response(
          JSON.stringify({
            files: [
              {
                id: "doc1",
                name: "Quarterly plan",
                mimeType: "application/vnd.google-apps.document",
                modifiedTime: "2026-07-01T00:00:00.000Z",
                webViewLink: "https://docs.google.com/d/doc1",
              },
              {
                id: "img1",
                name: "logo.png",
                mimeType: "image/png",
                modifiedTime: "2026-07-02T00:00:00.000Z",
              },
            ],
          }),
          { status: 200 },
        );
      }
      throw new Error(`unexpected ${url}`);
    });

    const result = await gdriveConnector.fetch(config, null);
    expect(result.records).toHaveLength(1); // png filtered out
    expect(result.records[0]!.markdown).toContain("# Quarterly plan");
    expect(result.records[0]!.metadata?.origin).toBe("https://docs.google.com/d/doc1");
    expect(result.nextCursor.modifiedAfter).toBe("2026-07-01T00:00:00.000Z");
  });

  test("incremental query carries the cursor", async () => {
    let capturedQuery = "";
    restore = setHttpFetch(async (url) => {
      if (url.includes("oauth2")) return new Response(JSON.stringify({ access_token: "at" }), { status: 200 });
      if (url.includes("/files?")) {
        capturedQuery = decodeURIComponent(new URL(url).searchParams.get("q") ?? "");
        return new Response(JSON.stringify({ files: [] }), { status: 200 });
      }
      throw new Error(`unexpected ${url}`);
    });
    await gdriveConnector.fetch(config, { modifiedAfter: "2026-06-30T00:00:00.000Z" });
    expect(capturedQuery).toContain("modifiedTime > '2026-06-30T00:00:00.000Z'");
    expect(capturedQuery).toContain("trashed = false");
  });
});
