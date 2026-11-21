import type { NextFunction, Request, Response } from 'express';
import { COOKIE, readCookie } from './http';

const WRITES = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** Writes that carry our session cookie must come from our own origin (Fetch Metadata, then Origin). */
export function csrfCheck(req: Request, res: Response, next: NextFunction) {
  if (!WRITES.has(req.method) || !readCookie(req, COOKIE)) return next();
  let blocked = req.headers['sec-fetch-site'] === 'cross-site';
  const origin = req.headers.origin;
  if (!blocked && origin) {
    try {
      const host = new URL(origin).host;
      blocked = host !== req.headers.host && host !== req.headers['x-forwarded-host'];
    } catch {
      blocked = true; // "Origin: null" and other junk
    }
  }
  if (blocked) {
    res.status(403).json({ error: 'Cross-site request blocked' });
    return;
  }
  next();
}
