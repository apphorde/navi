import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export async function openDatabase(root) {
  await mkdir(root, { recursive: true });
  const db = new DatabaseSync(path.join(root, 'navi.sqlite'));
  db.exec(`CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL); CREATE TABLE IF NOT EXISTS audit (id INTEGER PRIMARY KEY, user_id TEXT, action TEXT NOT NULL, path TEXT, detail TEXT, created_at TEXT NOT NULL);`);
  const get = db.prepare('SELECT value FROM settings WHERE key = ?');
  const set = db.prepare('INSERT INTO settings(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
  const addAudit = db.prepare('INSERT INTO audit(user_id, action, path, detail, created_at) VALUES(?, ?, ?, ?, ?)');
  return { db, getSetting: (key) => get.get(key)?.value, setSetting: (key, value) => set.run(key, value), audit: (user, action, filePath, detail = '') => addAudit.run(user?.id || 'unknown', action, filePath || null, detail.slice(0, 1000), new Date().toISOString()) };
}
