import { beforeAll, describe, expect, test } from "bun:test";
import { decryptSecret, encryptSecret, generateToken } from "./crypto";

beforeAll(() => {
  process.env.CREDENTIALS_MASTER_KEY = Buffer.alloc(32, 7).toString("base64");
});

describe("secret envelope", () => {
  test("round-trips", () => {
    const secret = "gbrain_client_secret_abc123";
    expect(decryptSecret(encryptSecret(secret))).toBe(secret);
  });

  test("distinct ciphertexts per call (fresh IV)", () => {
    expect(encryptSecret("x")).not.toBe(encryptSecret("x"));
  });

  test("tamper detection", () => {
    const enc = encryptSecret("x");
    const parts = enc.split(".");
    const dataChars = [...parts[3]!];
    dataChars[0] = dataChars[0] === "A" ? "B" : "A";
    parts[3] = dataChars.join("");
    expect(() => decryptSecret(parts.join("."))).toThrow();
  });
});

describe("generateToken", () => {
  test("url-safe and long enough", () => {
    const token = generateToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(token.length).toBeGreaterThanOrEqual(40);
  });
});
