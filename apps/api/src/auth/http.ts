import type { Request, Response } from 'express';

/** `__Host-` forces Secure, Path=/ and no Domain. Browsers treat http://localhost as secure. */
export const COOKIE = '__Host-sid';
export const SESSION_MS = 12 * 60 * 60 * 1000;


/** Render sits in front: the client is the first X-Forwarded-For entry. */
export function clientIp(req: Request): string {
  const fwd = req.headers['x-forwarded-for'];
  const first = (Array.isArray(fwd) ? fwd[0] : fwd)?.split(',')[0]?.trim();
  return first || req.socket.remoteAddress || 'unknown';
}

export function isHttps(req: Request): boolean {
  const proto = req.headers['x-forwarded-proto'];
  return (Array.isArray(proto) ? proto[0] : proto)?.split(',')[0]?.trim() === 'https' || req.secure;
}

/** Reads one cookie without pulling in cookie-parser. */
export function readCookie(req: Request, name: string): string | undefined {
  for (const part of (req.headers.cookie ?? '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return undefined;
}

const cookieOptions = { httpOnly: true, secure: true, sameSite: 'lax', path: '/' } as const;

export function setSessionCookie(res: Response, token: string) {
  res.cookie(COOKIE, token, { ...cookieOptions, maxAge: SESSION_MS });
}

export function clearSessionCookie(res: Response) {
  res.clearCookie(COOKIE, cookieOptions);
}
