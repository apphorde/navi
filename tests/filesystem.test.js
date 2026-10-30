import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, symlink, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createFilesystem, MAX_EDIT_BYTES } from "../src/filesystem.js";

test("filesystem reads, writes, detects conflicts, and prevents escapes", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "navi-"));
  const outside = await mkdtemp(path.join(os.tmpdir(), "navi-out-"));
  try {
    await writeFile(path.join(root, "a.txt"), "one\ntwo\n");
    const fs = createFilesystem(root);
    assert.equal((await fs.read("a.txt")).content, "one\ntwo\n");
    const opened = await fs.read("a.txt");
    await fs.write("a.txt", "changed\n", opened.version);
    assert.equal((await fs.read("a.txt")).content, "changed\n");
    await assert.rejects(
      () => fs.write("a.txt", "bad", opened.version),
      (error) => error.code === "CONFLICT",
    );
    await assert.rejects(
      () => fs.read("../secret"),
      (error) => error.code === "PATH_ESCAPE",
    );
    await writeFile(path.join(outside, "secret.txt"), "secret");
    await symlink(path.join(outside, "secret.txt"), path.join(root, "link.txt"));
    await assert.rejects(
      () => fs.read("link.txt"),
      (error) => error.code === "PATH_ESCAPE",
    );
    await assert.rejects(
      () => fs.create("a.txt"),
      (error) => error.code === "ALREADY_EXISTS",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
});

test("filesystem preserves modes and rejects binary content", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "navi-"));
  try {
    const fs = createFilesystem(root);
    await fs.create("folder", "directory");
    await writeFile(path.join(root, "binary"), Buffer.from([0, 1, 2]));
    await assert.rejects(
      () => fs.read("binary"),
      (error) => error.code === "BINARY_FILE",
    );
    await assert.rejects(
      () => fs.rename("missing", "new"),
      (error) => error.code === "NOT_FOUND",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("large previews stay bounded and safely truncate UTF-8", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "navi-"));
  try {
    const content = `${"a".repeat(MAX_EDIT_BYTES - 1)}😀z`;
    await writeFile(path.join(root, "large.txt"), content);
    const fs = createFilesystem(root);
    await assert.rejects(
      () => fs.read("large.txt"),
      (error) => error.code === "FILE_TOO_LARGE",
    );
    const preview = await fs.read("large.txt", { preview: true });
    assert.equal(preview.editable, false);
    assert.equal(preview.version, null);
    assert.equal(Buffer.byteLength(preview.content), MAX_EDIT_BYTES - 1);
    assert.equal(preview.content, "a".repeat(MAX_EDIT_BYTES - 1));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("writes editor changes to sibling saved files and finds saved files", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "navi-saved-"));
  try {
    await writeFile(path.join(root, "main.js"), "original\n");
    const filesystem = createFilesystem(root);
    const saved = await filesystem.writeSaved("main.js", "edited\n");
    assert.equal(saved.path, "main.js.saved");
    assert.equal(saved.content, "edited\n");
    assert.equal((await filesystem.read("main.js")).content, "original\n");
    assert.deepEqual(await filesystem.findSaved(), ["main.js.saved"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("replaces an original with its contained regular saved copy atomically", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "navi-replace-saved-"));
  const outside = await mkdtemp(path.join(os.tmpdir(), "navi-replace-out-"));
  try {
    await writeFile(path.join(root, "main.js"), "original\n");
    const filesystem = createFilesystem(root);
    await filesystem.writeSaved("main.js", "replacement\n");
    const result = await filesystem.replaceSaved("main.js");
    assert.equal(result.content, "replacement\n");
    assert.equal((await filesystem.read("main.js")).content, "replacement\n");
    await assert.rejects(
      () => filesystem.read("main.js.saved"),
      (error) => error.code === "NOT_FOUND",
    );
    await assert.rejects(
      () => filesystem.replaceSaved("missing.js"),
      (error) => error.code === "NOT_FOUND",
    );

    await writeFile(path.join(root, "binary.js"), "preserve me");
    await writeFile(path.join(root, "binary.js.saved"), Buffer.from([0, 1, 2]));
    await assert.rejects(
      () => filesystem.replaceSaved("binary.js"),
      (error) => error.code === "BINARY_FILE",
    );
    assert.equal((await filesystem.read("binary.js")).content, "preserve me");

    await writeFile(path.join(outside, "escape.js.saved"), "outside");
    await symlink(path.join(outside, "escape.js.saved"), path.join(root, "escape.js.saved"));
    await writeFile(path.join(root, "escape.js"), "safe");
    await assert.rejects(
      () => filesystem.replaceSaved("escape.js"),
      (error) => error.code === "PATH_ESCAPE",
    );
    assert.equal((await filesystem.read("escape.js")).content, "safe");

    await filesystem.create("folder", "directory");
    await writeFile(path.join(root, "folder.saved"), "not a directory replacement");
    await assert.rejects(
      () => filesystem.replaceSaved("folder"),
      (error) => error.code === "UNSUPPORTED_FILE_TYPE",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
});
