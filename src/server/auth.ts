// Password hashing on the main thread with Node's async scrypt (libuv pool),
// never blocking physics. At most one memory-heavy hash runs at once with a
// bounded queue; excess callers get a retryable BUSY instead of unbounded
// memory (§6). Hashes store their parameters so they can be raised later.
import { randomBytes, scrypt as scryptCb, timingSafeEqual, createHash, type ScryptOptions } from "node:crypto";
import { AUTH } from "../shared/config.ts";
import { AppError } from "./errors.ts";

const scrypt = (pw: string, salt: Buffer, keyLen: number, opts: ScryptOptions): Promise<Buffer> =>
  new Promise((resolve, reject) => scryptCb(pw, salt, keyLen, opts, (err, key) => (err ? reject(err) : resolve(key))));

let running = 0;
const waiting: (() => void)[] = [];

async function withSlot<T>(f: () => Promise<T>): Promise<T> {
  if (running >= AUTH.hashConcurrency) {
    if (waiting.length >= AUTH.hashQueue) throw new AppError("BUSY", "The server is busy signing people in. Try again in a few seconds.", 2000);
    await new Promise<void>((resolve) => waiting.push(resolve));
  }
  running++;
  try {
    return await f();
  } finally {
    running--;
    waiting.shift()?.();
  }
}

export async function hashPassword(password: string): Promise<string> {
  const { N, r, p, keyLen, maxmem } = AUTH.scrypt;
  const salt = randomBytes(16);
  const key = await withSlot(() => scrypt(password, salt, keyLen, { N, r, p, maxmem }));
  return `scrypt$${N}$${r}$${p}$${salt.toString("base64")}$${key.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [alg, n, r, p, saltB64, keyB64] = stored.split("$");
  if (alg !== "scrypt" || !n || !r || !p || !saltB64 || !keyB64) return false;
  const expected = Buffer.from(keyB64, "base64");
  const key = await withSlot(() =>
    scrypt(password, Buffer.from(saltB64, "base64"), expected.length, {
      N: Number(n),
      r: Number(r),
      p: Number(p),
      maxmem: AUTH.scrypt.maxmem,
    }),
  );
  return key.length === expected.length && timingSafeEqual(key, expected);
}

/** A real hash of a random password, used for unknown handles so timing doesn't reveal existence. */
let dummy: Promise<string> | null = null;
export const dummyHash = (): Promise<string> => (dummy ??= hashPassword(randomBytes(24).toString("base64")));

export const digest = (token: string): string => createHash("sha256").update(token).digest("hex");
export const newToken = (): string => randomBytes(32).toString("base64url");
/** Recovery codes: 32 random bytes, grouped for copying. Only the digest persists. */
export const newRecoveryCode = (): string =>
  randomBytes(32)
    .toString("base64url")
    .match(/.{1,6}/g)!
    .join("-");
export const normaliseRecoveryCode = (code: string): string => code.replace(/[\s-]/g, "");

export function checkPassword(pw: unknown): string {
  if (typeof pw !== "string") throw new AppError("BAD_REQUEST", "Enter a password.");
  if (pw.length < AUTH.passwordMin) throw new AppError("BAD_REQUEST", `Use at least ${AUTH.passwordMin} characters.`);
  if (pw.length > AUTH.passwordMax || Buffer.byteLength(pw) > AUTH.passwordMaxBytes) {
    throw new AppError("BAD_REQUEST", `Use at most ${AUTH.passwordMax} characters.`);
  }
  return pw;
}
