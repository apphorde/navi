import { constants, promises as fs } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

export const MAX_EDIT_BYTES = 1024 * 1024;
export const MAX_EDIT_LINES = 20_000;

export class FsError extends Error {
  constructor(code, message, status = 500) {
    super(message);
    this.name = 'FsError';
    this.code = code;
    this.status = status;
  }
}

export function createFilesystem(root) {
  const absoluteRoot = path.resolve(root);

  function safePath(input, allowRoot = false) {
    if (typeof input !== 'string' || input.includes('\0')) throw new FsError('INVALID_PATH', 'Invalid path', 422);
    const relative = input.replaceAll('\\', '/').replace(/^\/+/, '');
    const resolved = path.resolve(absoluteRoot, relative);
    if (resolved !== absoluteRoot && !resolved.startsWith(`${absoluteRoot}${path.sep}`)) {
      throw new FsError('PATH_ESCAPE', 'Path is outside the data root', 403);
    }
    if (!allowRoot && resolved === absoluteRoot) throw new FsError('INVALID_PATH', 'The data root is not a file', 422);
    return { relative: relative || '.', resolved };
  }

  async function ensureContained(resolved) {
    let real;
    try {
      real = await fs.realpath(resolved);
      const rootReal = await fs.realpath(absoluteRoot);
      if (real !== rootReal && !real.startsWith(`${rootReal}${path.sep}`)) throw new FsError('PATH_ESCAPE', 'Symlink resolves outside the data root', 403);
    } catch (error) {
      if (error instanceof FsError) throw error;
      if (error.code !== 'ENOENT') throw mapFsError(error);
    }
  }

  function mapFsError(error) {
    const map = { ENOENT: ['NOT_FOUND', 'Path not found', 404], EACCES: ['PERMISSION_DENIED', 'Permission denied', 403], EPERM: ['PERMISSION_DENIED', 'Permission denied', 403], EISDIR: ['IS_DIRECTORY', 'A directory was expected to be a file', 409], ENOTDIR: ['NOT_DIRECTORY', 'A file was expected to be a directory', 409], EEXIST: ['ALREADY_EXISTS', 'Path already exists', 409], ENOSPC: ['NO_SPACE', 'Storage is full', 507], EXDEV: ['CROSS_DEVICE', 'Operation crosses filesystem devices', 500] };
    const [code, message, status] = map[error.code] || ['STORAGE_ERROR', 'Filesystem operation failed', 500];
    return new FsError(code, message, status);
  }

  async function stat(input) {
    const { relative, resolved } = safePath(input, true);
    await ensureContained(resolved);
    try { return { relative, resolved, stat: await fs.stat(resolved) }; } catch (error) { throw mapFsError(error); }
  }

  async function list(input = '.') {
    const { relative, resolved } = safePath(input, true);
    await ensureContained(resolved);
    let entries;
    try { entries = await fs.readdir(resolved, { withFileTypes: true }); } catch (error) { throw mapFsError(error); }
    const result = [];
    for (const entry of entries.sort((a, b) => (a.isDirectory() !== b.isDirectory() ? Number(b.isDirectory()) - Number(a.isDirectory()) : a.name.localeCompare(b.name)))) {
      const child = path.posix.join(relative === '.' ? '' : relative, entry.name) || entry.name;
      try {
        const item = await stat(child);
        result.push({ name: entry.name, path: child, type: item.stat.isDirectory() ? 'directory' : item.stat.isFile() ? 'file' : 'other', size: item.stat.size, modified: item.stat.mtime.toISOString() });
      } catch (error) {
        if (error instanceof FsError && ['NOT_FOUND', 'PATH_ESCAPE', 'PERMISSION_DENIED'].includes(error.code)) result.push({ name: entry.name, path: child, type: 'inaccessible', error: error.code });
        else throw error;
      }
    }
    return result;
  }

  function classify(buffer, name) {
    const ext = path.extname(name).toLowerCase();
    const binary = buffer.subarray(0, Math.min(buffer.length, 8192)).includes(0);
    const language = { '.js': 'javascript', '.mjs': 'javascript', '.ts': 'typescript', '.tsx': 'tsx', '.jsx': 'jsx', '.json': 'json', '.css': 'css', '.html': 'html', '.md': 'markdown', '.yaml': 'yaml', '.yml': 'yaml', '.sh': 'shell', '.sql': 'sql', '.php': 'php', '.py': 'python', '.rs': 'rust', '.go': 'go', '.txt': 'text' }[ext] || 'text';
    return { binary, language };
  }

  async function read(input, { preview = false } = {}) {
    const item = await stat(input);
    if (item.stat.isDirectory()) throw new FsError('IS_DIRECTORY', 'Cannot read a directory as a file', 409);
    let buffer;
    try { buffer = await fs.readFile(item.resolved); } catch (error) { throw mapFsError(error); }
    const type = classify(buffer, input);
    if (type.binary) throw new FsError('BINARY_FILE', 'Binary files are not supported', 415);
    const text = buffer.toString('utf8');
    if (Buffer.byteLength(text) !== buffer.length) throw new FsError('INVALID_ENCODING', 'File is not valid UTF-8', 415);
    const lines = text.length ? text.split(/\r\n|\r|\n/).length : 0;
    const limited = buffer.length > MAX_EDIT_BYTES || lines > MAX_EDIT_LINES;
    if (limited && !preview) throw new FsError('FILE_TOO_LARGE', 'File exceeds the editor limit', 413);
    return { path: item.relative, content: limited ? text.slice(0, MAX_EDIT_BYTES) : text, size: item.stat.size, modified: item.stat.mtime.toISOString(), mode: item.stat.mode & 0o777, language: type.language, lineEnding: text.includes('\r\n') ? 'CRLF' : 'LF', editable: !limited, version: version(buffer, item.stat) };
  }

  function version(buffer, itemStat) { return `${itemStat.mtimeMs}:${itemStat.size}:${createHash('sha256').update(buffer).digest('hex').slice(0, 16)}`; }

  async function write(input, content, expectedVersion) {
    if (typeof content !== 'string') throw new FsError('INVALID_CONTENT', 'Content must be text', 422);
    const bytes = Buffer.byteLength(content);
    if (bytes > MAX_EDIT_BYTES || content.split(/\r\n|\r|\n/).length > MAX_EDIT_LINES) throw new FsError('FILE_TOO_LARGE', 'File exceeds the editor limit', 413);
    const item = await stat(input);
    if (item.stat.isDirectory()) throw new FsError('IS_DIRECTORY', 'Cannot write a directory', 409);
    const current = await read(input);
    if (expectedVersion && current.version !== expectedVersion) throw new FsError('CONFLICT', 'File changed since it was opened', 409);
    const temp = `${item.resolved}.navi-${process.pid}-${Date.now()}.tmp`;
    try { await fs.writeFile(temp, content, { mode: item.stat.mode & 0o777 }); await fs.rename(temp, item.resolved); } catch (error) { try { await fs.unlink(temp); } catch {} throw mapFsError(error); }
    return read(input);
  }

  async function create(input, kind = 'file') {
    const { resolved } = safePath(input);
    await ensureContained(path.dirname(resolved));
    try { if (kind === 'directory') await fs.mkdir(resolved); else await fs.writeFile(resolved, '', { flag: 'wx', mode: 0o644 }); } catch (error) { throw mapFsError(error); }
    return stat(input);
  }

  async function rename(input, destination) {
    const source = await stat(input);
    const target = safePath(destination);
    await ensureContained(path.dirname(target.resolved));
    try { await fs.lstat(target.resolved); throw new FsError('ALREADY_EXISTS', 'Destination already exists', 409); } catch (error) { if (error instanceof FsError) throw error; if (error.code !== 'ENOENT') throw mapFsError(error); }
    try { await fs.rename(source.resolved, target.resolved); } catch (error) { throw mapFsError(error); }
    return stat(destination);
  }

  return { root: absoluteRoot, safePath, list, stat, read, write, create, rename, classify };
}
