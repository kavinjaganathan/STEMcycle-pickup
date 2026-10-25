import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

/**
 * scrypt password hashes: "scrypt:N:r:p:<salt b64>:<hash b64>" (no "$", so .env files don't try to expand it). Used for the
 * admin password (stored in ADMIN_PASSWORD_HASH) and for local-dev driver
 * accounts. Hosted driver passwords live in Supabase Auth (bcrypt).
 */
const N = 16384;
const R = 8;
const P = 1;
const KEYLEN = 32;

function derive(password: string, salt: Buffer, n: number, r: number, p: number) {
  return new Promise<Buffer>((resolve, reject) =>
    scrypt(password, salt, KEYLEN, { N: n, r, p, maxmem: 64 * 1024 * 1024 }, (err, key) =>
      err ? reject(err) : resolve(key),
    ),
  );
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(password, salt, N, R, P);
  return `scrypt:${N}:${R}:${P}:${salt.toString("base64")}:${key.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split(":");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [n, r, p] = parts.slice(1, 4).map(Number);
  if (![n, r, p].every(Number.isInteger) || n > 1 << 20) return false;
  const expected = Buffer.from(parts[5], "base64");
  const key = await derive(password, Buffer.from(parts[4], "base64"), n, r, p);
  return key.length === expected.length && timingSafeEqual(key, expected);
}
