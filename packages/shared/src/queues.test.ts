import { describe, expect, test } from "bun:test";
import { QUEUES } from "./queues";

describe("queue registry", () => {
  test("names are unique and kebab-case", () => {
    const names = Object.values(QUEUES);
    expect(new Set(names).size).toBe(names.length);
    for (const name of names) {
      expect(name).toMatch(/^[a-z]+(?:-[a-z]+)*$/);
    }
  });
});
