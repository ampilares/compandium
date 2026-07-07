import { describe, expect, test } from "bun:test";
import { isValidSlug, slugify, tenantFlyAppName } from "./slug";

describe("slugify", () => {
  test("lowercases and dashes", () => {
    expect(slugify("Acme Co!")).toBe("acme-co");
  });
  test("strips diacritics", () => {
    expect(slugify("Café Über")).toBe("cafe-uber");
  });
  test("trims leading/trailing dashes", () => {
    expect(slugify("--hello--")).toBe("hello");
  });
});

describe("isValidSlug", () => {
  test("accepts normal slugs", () => {
    expect(isValidSlug("acme-co")).toBe(true);
  });
  test("rejects reserved", () => {
    expect(isValidSlug("admin")).toBe(false);
  });
  test("rejects leading dash", () => {
    expect(isValidSlug("-acme")).toBe(false);
  });
});

describe("tenantFlyAppName", () => {
  test("is namespaced and fly-safe", () => {
    const name = tenantFlyAppName("acme-co");
    expect(name.startsWith("cpd-acme-co-")).toBe(true);
    expect(name).toMatch(/^[a-z0-9-]+$/);
  });
});
