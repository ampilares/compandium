import { describe, expect, test } from "bun:test";
import { intervalMs } from "./connector-sync";

describe("intervalMs", () => {
  test("parses minute and hour shorthands", () => {
    expect(intervalMs("30m")).toBe(30 * 60_000);
    expect(intervalMs("6h")).toBe(6 * 3_600_000);
    expect(intervalMs("24h")).toBe(24 * 3_600_000);
  });
  test("rejects everything else", () => {
    expect(intervalMs("daily")).toBeNull();
    expect(intervalMs("5")).toBeNull();
    expect(intervalMs("1d")).toBeNull();
    expect(intervalMs("")).toBeNull();
  });
});
