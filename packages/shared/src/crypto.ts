import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// AES-256-GCM envelope for secrets at rest (tenant agent tokens, gbrain client
// secrets, connector credentials). Key comes from CREDENTIALS_MASTER_KEY:
// 32 bytes, base64-encoded. Output format: v1.<iv b64>.<tag b64>.<ciphertext b64>

const VERSION = "v1";

function masterKey(): Buffer {
  const raw = process.env.CREDENTIALS_MASTER_KEY;
  if (!raw) throw new Error("CREDENTIALS_MASTER_KEY is not set");
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error("CREDENTIALS_MASTER_KEY must be 32 bytes, base64-encoded");
  }
  return key;
}

export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", masterKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString("base64"), tag.toString("base64"), ciphertext.toString("base64")].join(".");
}

export function decryptSecret(encoded: string): string {
  const [version, ivB64, tagB64, dataB64] = encoded.split(".");
  if (version !== VERSION || !ivB64 || !tagB64 || !dataB64) {
    throw new Error("Malformed encrypted secret");
  }
  const decipher = createDecipheriv("aes-256-gcm", masterKey(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]).toString("utf8");
}

export function generateToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}
