import { describe, expect, test } from "bun:test";
import { gitConfigSchema } from "./git";
import { pathFromStableId } from "./types";

describe("pathFromStableId", () => {
  test("keeps folder structure, adds .md", () => {
    expect(pathFromStableId("notion", "team/Runbooks/Rate Limits")).toBe(
      "notion/team/Runbooks/Rate-Limits.md",
    );
  });
  test("neutralizes traversal", () => {
    expect(pathFromStableId("x", "../../etc/passwd")).not.toContain("..");
  });
  test("handles empty ids", () => {
    expect(pathFromStableId("x", "")).toBe("x/item.md");
  });
});

describe("gitConfigSchema", () => {
  test("accepts https URLs", () => {
    expect(gitConfigSchema.safeParse({ repoUrl: "https://github.com/a/b" }).success).toBe(true);
  });
  test("rejects ssh/file URLs", () => {
    expect(gitConfigSchema.safeParse({ repoUrl: "file:///etc" }).success).toBe(false);
    expect(gitConfigSchema.safeParse({ repoUrl: "ssh://git@host/repo" }).success).toBe(false);
  });
  test("rejects subdir traversal", () => {
    expect(gitConfigSchema.safeParse({ repoUrl: "https://x.y/r", subdir: "../up" }).success).toBe(
      false,
    );
  });
});
