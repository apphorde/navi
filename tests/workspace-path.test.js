import test from "node:test";
import assert from "node:assert/strict";
import { sanitizeWorkspacePath } from "../public/workspace-path.js";

test("sanitizes URL paths to workspace-relative paths", () => {
  assert.equal(sanitizeWorkspacePath("/path/to/file.txt"), "path/to/file.txt");
  assert.equal(sanitizeWorkspacePath("path//to/./file.txt"), "path/to/file.txt");
  assert.equal(sanitizeWorkspacePath(new URLSearchParams("p=%2Fpath%2Fto%2Ffile.txt").get("p")), "path/to/file.txt");
});

test("rejects unsafe or unusable URL paths", () => {
  for (const input of ["/../secret", "path/../../secret", "path\\secret", "path\0secret", "/", ""]) {
    assert.equal(sanitizeWorkspacePath(input), null);
  }
  assert.equal(sanitizeWorkspacePath("x".repeat(4097)), null);
  assert.equal(sanitizeWorkspacePath(new URLSearchParams("p=%2F..%2Fsecret").get("p")), null);
});
