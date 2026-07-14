import { randomUUID, timingSafeEqual } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const SESSION_TTL_MS = 1000 * 60 * 60 * 12;
const COOKIE_NAME = 'admin_session';
const SESSIONS_FILE = resolve('data', 'sessions.json');

const LOGIN_MAX_ATTEMPTS = Number(process.env.ADMIN_LOGIN_MAX_ATTEMPTS) || 5;
const LOGIN_WINDOW_MS = (Number(process.env.ADMIN_LOGIN_WINDOW_MINUTES) || 15) * 60 * 1000;
const LOGIN_LOCKOUT_MS = (Number(process.env.ADMIN_LOGIN_LOCKOUT_MINUTES) || 15) * 60 * 1000;
const loginAttemptsByIp = new Map();

function loginClientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (fwd) return String(fwd).split(',')[0].trim();
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

function loginRateState(ip) {
  const now = Date.now();
  const entry = loginAttemptsByIp.get(ip);
  if (!entry) return { blocked: false, msLeft: 0 };
  if (entry.lockedUntil && entry.lockedUntil > now) {
    return { blocked: true, msLeft: entry.lockedUntil - now };
  }
  return { blocked: false, msLeft: 0 };
}

function registerLoginFailure(ip) {
  const now = Date.now();
  const cutoff = now - LOGIN_WINDOW_MS;
  const entry = loginAttemptsByIp.get(ip) || { fails: [], lockedUntil: 0 };
  entry.fails = entry.fails.filter((t) => t > cutoff);
  entry.fails.push(now);
  if (entry.fails.length >= LOGIN_MAX_ATTEMPTS) {
    entry.lockedUntil = now + LOGIN_LOCKOUT_MS;
    entry.fails = [];
    console.warn('[Admin login] IP заблокирован до', new Date(entry.lockedUntil).toISOString(), ip);
  }
  loginAttemptsByIp.set(ip, entry);
}

function clearLoginFailures(ip) {
  loginAttemptsByIp.delete(ip);
}

function passwordsMatch(input, expected) {
  const a = Buffer.from(String(input));
  const b = Buffer.from(String(expected));
  if (a.length !== b.length) {
    timingSafeEqual(a, a);
    return false;
  }
  return timingSafeEqual(a, b);
}

const SESSIONS = loadSessionsFromDisk();

function loadSessionsFromDisk() {
  const map = new Map();
  if (!existsSync(SESSIONS_FILE)) return map;
  try {
    const raw = JSON.parse(readFileSync(SESSIONS_FILE, 'utf8'));
    const now = Date.now();
    for (const [token, session] of Object.entries(raw || {})) {
      if (session?.expiresAt > now) map.set(token, session);
    }
  } catch {
    /* ignore corrupt file */
  }
  return map;
}

function persistSessions() {
  const dir = resolve('data');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const obj = {};
  for (const [token, session] of SESSIONS) obj[token] = session;
  writeFileSync(SESSIONS_FILE, JSON.stringify(obj, null, 2), 'utf8');
}

function isPasswordConfigured() {
  return typeof process.env.ADMIN_PASSWORD === 'string' && process.env.ADMIN_PASSWORD.length > 0;
}

function isAuthDisabled() {
  const v = String(process.env.ADMIN_AUTH_DISABLED || '').toLowerCase();
  return v === 'true' || v === '1' || v === 'yes';
}

function parseCookies(req) {
  const header = req.headers.cookie;
  if (!header) return {};
  const out = {};
  for (const part of header.split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (!k) continue;
    out[k] = decodeURIComponent(rest.join('='));
  }
  return out;
}

function pruneExpired() {
  const now = Date.now();
  let dirty = false;
  for (const [token, session] of SESSIONS) {
    if (session.expiresAt <= now) {
      SESSIONS.delete(token);
      dirty = true;
    }
  }
  if (dirty) persistSessions();
}

function readSession(req) {
  pruneExpired();
  const token = parseCookies(req)[COOKIE_NAME];
  if (!token) return null;
  const session = SESSIONS.get(token);
  if (!session) return null;
  if (session.expiresAt <= Date.now()) {
    SESSIONS.delete(token);
    return null;
  }
  return { token, ...session };
}

function setSessionCookie(res, token, maxAgeMs) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader(
    'Set-Cookie',
    `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${Math.floor(maxAgeMs / 1000)}${secure}`
  );
}

function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`);
}

export function loginHandler(req, res) {
  if (isAuthDisabled()) {
    return res.json({ ok: true });
  }
  if (!isPasswordConfigured()) {
    return res.status(503).json({ ok: false, error: 'Админ-панель не настроена (нет ADMIN_PASSWORD)' });
  }
  const ip = loginClientIp(req);
  const rate = loginRateState(ip);
  if (rate.blocked) {
    const minsLeft = Math.ceil(rate.msLeft / 60000);
    return res.status(429).json({ ok: false, error: `Слишком много попыток. Повторите через ${minsLeft} мин.` });
  }
  const { password } = req.body || {};
  if (!password || !passwordsMatch(password, process.env.ADMIN_PASSWORD)) {
    registerLoginFailure(ip);
    return res.status(401).json({ ok: false, error: 'Неверный пароль' });
  }
  clearLoginFailures(ip);
  const token = randomUUID();
  const expiresAt = Date.now() + SESSION_TTL_MS;
  SESSIONS.set(token, { createdAt: Date.now(), expiresAt });
  persistSessions();
  setSessionCookie(res, token, SESSION_TTL_MS);
  res.json({ ok: true });
}

export function logoutHandler(req, res) {
  const session = readSession(req);
  if (session) {
    SESSIONS.delete(session.token);
    persistSessions();
  }
  clearSessionCookie(res);
  res.json({ ok: true });
}

export function statusHandler(req, res) {
  if (isAuthDisabled()) {
    return res.json({ configured: true, authenticated: true, authDisabled: true });
  }
  if (!isPasswordConfigured()) {
    return res.json({ configured: false, authenticated: false });
  }
  const session = readSession(req);
  res.json({ configured: true, authenticated: Boolean(session) });
}

export function requireAdmin(req, res, next) {
  if (isAuthDisabled()) return next();
  if (!isPasswordConfigured()) {
    return res.status(503).json({ ok: false, error: 'Админ-панель не настроена' });
  }
  const session = readSession(req);
  if (!session) return res.status(401).json({ ok: false, error: 'Требуется вход' });
  next();
}
