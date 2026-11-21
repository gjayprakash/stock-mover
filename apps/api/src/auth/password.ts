import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

// OWASP scrypt parameters. 128*N*r = 128 MiB, above Node's 32 MiB default maxmem.
const N = 2 ** 17;
const R = 8;
const P = 1;
const KEYLEN = 32;
const MAXMEM = 256 * 1024 * 1024;
const FORMAT = /^\$scrypt\$ln=17,r=8,p=1\$([A-Za-z0-9+/=]+)\$([A-Za-z0-9+/=]+)$/;

export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 200;

/** Plain-language problem with a new password, or null when it is fine. */
export function passwordProblem(password: string): string | null {
  if (password.length < PASSWORD_MIN) return `Use at least ${PASSWORD_MIN} characters`;
  if (password.length > PASSWORD_MAX) return `Use at most ${PASSWORD_MAX} characters`;
  return null;
}

function derive(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, KEYLEN, { N, r: R, p: P, maxmem: MAXMEM }, (err, key) => (err ? reject(err) : resolve(key)));
  });
}

/** `$scrypt$ln=17,r=8,p=1$<salt b64>$<hash b64>` */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(password, salt);
  return `$scrypt$ln=17,r=8,p=1$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const m = FORMAT.exec(stored);
  if (!m) return false;
  const expected = Buffer.from(m[2], 'base64');
  const key = await derive(password, Buffer.from(m[1], 'base64'));
  return key.length === expected.length && timingSafeEqual(key, expected);
}

let dummy: Promise<string> | undefined;
/** Compared against when the email is unknown, so timing does not reveal which emails exist. */
export function dummyHash(): Promise<string> {
  return (dummy ??= hashPassword(randomBytes(16).toString('hex')));
}
