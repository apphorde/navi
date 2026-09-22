import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createFilesystem, FsError } from '../src/filesystem.js';

test('filesystem reads, writes, detects conflicts, and prevents escapes', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'navi-')); const outside = await mkdtemp(path.join(os.tmpdir(), 'navi-out-'));
  try {
    await writeFile(path.join(root, 'a.txt'), 'one\ntwo\n'); const fs = createFilesystem(root);
    assert.equal((await fs.read('a.txt')).content, 'one\ntwo\n');
    const opened = await fs.read('a.txt'); await fs.write('a.txt', 'changed\n', opened.version); assert.equal((await fs.read('a.txt')).content, 'changed\n');
    await assert.rejects(() => fs.write('a.txt', 'bad', opened.version), (error) => error.code === 'CONFLICT');
    await assert.rejects(() => fs.read('../secret'), (error) => error.code === 'PATH_ESCAPE');
    await writeFile(path.join(outside, 'secret.txt'), 'secret'); await symlink(path.join(outside, 'secret.txt'), path.join(root, 'link.txt'));
    await assert.rejects(() => fs.read('link.txt'), (error) => error.code === 'PATH_ESCAPE');
    await assert.rejects(() => fs.create('a.txt'), (error) => error.code === 'ALREADY_EXISTS');
  } finally { await rm(root, { recursive: true, force: true }); await rm(outside, { recursive: true, force: true }); }
});

test('filesystem preserves modes and rejects binary content', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'navi-'));
  try { const fs = createFilesystem(root); await fs.create('folder', 'directory'); await writeFile(path.join(root, 'binary'), Buffer.from([0, 1, 2])); await assert.rejects(() => fs.read('binary'), (error) => error.code === 'BINARY_FILE'); await assert.rejects(() => fs.rename('missing', 'new'), (error) => error.code === 'NOT_FOUND'); } finally { await rm(root, { recursive: true, force: true }); }
});
