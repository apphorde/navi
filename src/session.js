import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export function createSessions(secret) {
  const sessions = new Map();
  const sign = (value) => createHmac('sha256', secret).update(value).digest('base64url');
  const cookie = (id) => `${id}.${sign(id)}`;
  function issue(data, maxAge = 86400) { const id = randomBytes(32).toString('base64url'); sessions.set(id, { ...data, expires: Date.now() + maxAge * 1000 }); return { id, value: cookie(id), maxAge }; }
  function read(value) { if (!value) return null; const [id, signature] = value.split('.'); if (!id || !signature) return null; const expected = sign(id); if (signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null; const result = sessions.get(id); if (!result || result.expires < Date.now()) { sessions.delete(id); return null; } return { id, ...result }; }
  function update(id, data) { const current = sessions.get(id); if (current) sessions.set(id, { ...current, ...data }); }
  function remove(id) { sessions.delete(id); }
  return { issue, read, update, remove };
}

export function parseCookies(request) { return Object.fromEntries((request.headers.cookie || '').split(';').filter(Boolean).map((part) => { const i = part.indexOf('='); return [part.slice(0, i).trim(), decodeURIComponent(part.slice(i + 1).trim())]; })); }
