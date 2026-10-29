import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export function createSessions(secret) {
  const sessions = new Map();
  const sign = (value) => createHmac("sha256", secret).update(value).digest("base64url");
  const cookie = (id) => `${id}.${sign(id)}`;
  function issue(data, maxAge = 86400) {
    const id = randomBytes(32).toString("base64url");
    sessions.set(id, { ...data, expires: Date.now() + maxAge * 1000 });
    return { id, value: cookie(id), maxAge };
  }
  function read(value) {
    if (!value) {
      return null;
    }
    const [id, signature] = value.split(".");
    if (!id || !signature) {
      return null;
    }
    const expected = sign(id);
    if (signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
      return null;
    }
    const result = sessions.get(id);
    if (!result || result.expires < Date.now()) {
      sessions.delete(id);
      return null;
    }
    return { id, ...result };
  }
  function update(id, data) {
    const current = sessions.get(id);
    if (current) {
      sessions.set(id, { ...current, ...data });
    }
  }
  function remove(id) {
    sessions.delete(id);
  }
  return { issue, read, update, remove };
}

export function parseCookies(request) {
  const cookies = {};
  for (const part of (request.headers.cookie || "").split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) {
      continue;
    }
    const name = part.slice(0, separator).trim();
    if (!name) {
      continue;
    }
    try {
      cookies[name] = decodeURIComponent(part.slice(separator + 1).trim());
    } catch {
      continue;
    }
  }
  return cookies;
}
