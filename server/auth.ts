import crypto from 'crypto';
import type { NextFunction, Request, Response } from 'express';

const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
export const ADMIN_COOKIE_NAME = 'oseven_admin_session';

interface RateLimitEntry {
  failures: number;
  lockedUntil: number;
  lastFailureAt: number;
}

const rateLimits = new Map<string, RateLimitEntry>();
const MAX_FAILURES = 5;
const LOCKOUT_MS = 5 * 60 * 1000;
const WINDOW_MS = 10 * 60 * 1000;

export function getClientIp(req: Request): string {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.length > 0) {
    return fwd.split(',')[0].trim();
  }
  return req.ip || req.socket.remoteAddress || 'unknown';
}

export function checkLoginRateLimit(ip: string): { allowed: boolean; retryAfterSec: number } {
  const entry = rateLimits.get(ip);
  if (!entry) return { allowed: true, retryAfterSec: 0 };

  const now = Date.now();
  if (entry.lockedUntil > now) {
    return { allowed: false, retryAfterSec: Math.ceil((entry.lockedUntil - now) / 1000) };
  }
  if (now - entry.lastFailureAt > WINDOW_MS) {
    rateLimits.delete(ip);
  }
  return { allowed: true, retryAfterSec: 0 };
}

export function recordLoginFailure(ip: string): { locked: boolean; attemptsLeft: number; retryAfterSec: number } {
  const now = Date.now();
  const existing = rateLimits.get(ip);
  const count = existing && now - existing.lastFailureAt <= WINDOW_MS ? existing.failures + 1 : 1;

  if (count >= MAX_FAILURES) {
    rateLimits.set(ip, { failures: count, lockedUntil: now + LOCKOUT_MS, lastFailureAt: now });
    return { locked: true, attemptsLeft: 0, retryAfterSec: Math.ceil(LOCKOUT_MS / 1000) };
  }
  rateLimits.set(ip, { failures: count, lockedUntil: 0, lastFailureAt: now });
  return { locked: false, attemptsLeft: MAX_FAILURES - count, retryAfterSec: 0 };
}

export function clearLoginFailures(ip: string): void {
  rateLimits.delete(ip);
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;
  const [salt, keyHex] = parts;
  const keyBuf = Buffer.from(keyHex, 'hex');
  const derivedBuf = crypto.scryptSync(password, salt, 64);
  if (keyBuf.length !== derivedBuf.length) return false;
  return crypto.timingSafeEqual(keyBuf, derivedBuf);
}

export interface SessionPayload {
  role: 'admin';
  ver: number;
  exp: number;
}

export function createSessionToken(tokenVersion: number): string {
  const payload: SessionPayload = {
    role: 'admin',
    ver: tokenVersion,
    exp: Date.now() + 7 * 24 * 60 * 60 * 1000,
  };
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(encoded).digest('base64url');
  return `${encoded}.${sig}`;
}

export function verifySessionToken(token: string, expectedVersion: number): SessionPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 2) return null;
    const [encoded, sig] = parts;
    const expectedSig = crypto.createHmac('sha256', SESSION_SECRET).update(encoded).digest('base64url');
    const sigBuf = Buffer.from(sig);
    const expBuf = Buffer.from(expectedSig);
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      return null;
    }
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as SessionPayload;
    if (payload.role !== 'admin' || payload.ver !== expectedVersion || payload.exp < Date.now()) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

export function setAdminSessionCookie(req: Request, res: Response, token: string): void {
  const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
  const attrs = [
    `${ADMIN_COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    `Max-Age=${7 * 24 * 60 * 60}`,
  ];
  if (isHttps) {
    attrs.push('Secure', 'SameSite=None', 'Partitioned');
  } else {
    attrs.push('SameSite=Lax');
  }
  res.setHeader('Set-Cookie', attrs.join('; '));
}

export function clearAdminSessionCookie(req: Request, res: Response): void {
  const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
  const attrs = [
    `${ADMIN_COOKIE_NAME}=`,
    'Path=/',
    'HttpOnly',
    'Max-Age=0',
  ];
  if (isHttps) {
    attrs.push('Secure', 'SameSite=None', 'Partitioned');
  } else {
    attrs.push('SameSite=Lax');
  }
  res.setHeader('Set-Cookie', attrs.join('; '));
}

export function isStrongAdminPassword(password: string): { valid: boolean; message?: string } {
  if (password.length < 8) {
    return { valid: false, message: 'Password must be at least 8 characters long.' };
  }
  const hasLetter = /[a-zA-Z]/.test(password);
  const hasNumberOrSymbol = /[0-9!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password);
  if (!hasLetter || !hasNumberOrSymbol) {
    return { valid: false, message: 'Password must combine letters with numbers or symbols.' };
  }
  return { valid: true };
}

export function makeAdminAuthMiddleware(getTokenVersion: () => number) {
  return (req: Request, res: Response, next: NextFunction) => {
    const cookieToken = req.cookies?.[ADMIN_COOKIE_NAME];
    const authHeader = req.headers.authorization;
    const bearerToken =
      typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
        ? authHeader.slice(7).trim()
        : undefined;

    const token = bearerToken || cookieToken;
    if (!token) {
      res.status(401).json({ error: 'Unauthorized: admin session required' });
      return;
    }

    // CSRF protection when relying on cookie for state-changing methods
    if (!bearerToken && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
      const requestedWith = req.headers['x-requested-with'];
      if (requestedWith !== 'OSEVEN-Admin') {
        res.status(403).json({ error: 'Forbidden: missing CSRF verification header' });
        return;
      }
    }

    const payload = verifySessionToken(token, getTokenVersion());
    if (!payload) {
      res.status(401).json({ error: 'Session expired or invalid' });
      return;
    }

    next();
  };
}
