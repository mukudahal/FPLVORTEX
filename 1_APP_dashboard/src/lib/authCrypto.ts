import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);
const PREFIX = "scrypt-v1";

export function normalizeEmail(value: unknown): string {
  if (typeof value !== "string") throw new RangeError("Enter a valid email address.");
  const email = value.trim().toLowerCase();
  if (email.length < 3 || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new RangeError("Enter a valid email address.");
  }
  return email;
}

export function validatePassword(password: unknown): asserts password is string {
  if (typeof password !== "string" || password.length < 12 || password.length > 256) {
    throw new RangeError("Password must contain 12–256 characters.");
  }
}

export async function hashPassword(password: string): Promise<string> {
  validatePassword(password);
  const salt = randomBytes(16);
  const derived = await scrypt(password, salt, 64) as Buffer;
  return `${PREFIX}$${salt.toString("hex")}$${derived.toString("hex")}`;
}

export async function verifyPassword(password: unknown, encoded: string | null): Promise<boolean> {
  if (typeof password !== "string" || password.length < 1 || password.length > 256 || !encoded) return false;
  const [prefix, saltHex, expectedHex, excess] = encoded.split("$");
  if (prefix !== PREFIX || excess !== undefined || !saltHex || !expectedHex ||
      !/^[0-9a-f]{32}$/.test(saltHex) || !/^[0-9a-f]{128}$/.test(expectedHex)) return false;
  try {
    const derived = await scrypt(password, Buffer.from(saltHex, "hex"), 64) as Buffer;
    return timingSafeEqual(derived, Buffer.from(expectedHex, "hex"));
  } catch { return false; }
}

export function issueToken(): { plain: string; digest: string } {
  const plain = randomBytes(32).toString("base64url");
  return { plain, digest: tokenDigest(plain) };
}

export function tokenDigest(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function isValidToken(token: unknown): token is string {
  return typeof token === "string" && /^[A-Za-z0-9_-]{43}$/.test(token);
}
