import { describe, expect, test } from "bun:test";
import { isSafeSlug, parseRegisterClientOutput } from "./cli";

describe("parseRegisterClientOutput", () => {
  test("parses id + secret", () => {
    const out = `OAuth client registered: "alice"

  Client ID:           gbrain_client_abc123
  Client Secret:       gbrain_secret_xyz789

  Grant types:         client_credentials
`;
    expect(parseRegisterClientOutput(out)).toEqual({
      clientId: "gbrain_client_abc123",
      clientSecret: "gbrain_secret_xyz789",
    });
  });

  test("returns null for public clients", () => {
    const out = `  Client ID:           abc\n  Client Secret:       <public client — none issued>\n`;
    expect(parseRegisterClientOutput(out)).toBeNull();
  });
});

describe("isSafeSlug", () => {
  test("accepts department slugs", () => {
    expect(isSafeSlug("engineering")).toBe(true);
    expect(isSafeSlug("sales-emea")).toBe(true);
  });
  test("rejects traversal attempts", () => {
    expect(isSafeSlug("../etc")).toBe(false);
    expect(isSafeSlug("a/b")).toBe(false);
    expect(isSafeSlug("")).toBe(false);
    expect(isSafeSlug(undefined)).toBe(false);
  });
});
