import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("file preview binds content to the code block source", async () => {
  const components = await readFile(new URL("../public/components.html", import.meta.url), "utf8");
  const preview = components.match(/<template\s+component="file-preview"[^>]*>([\s\S]*?)<\/template>/)?.[1];

  assert.ok(preview, "file-preview component should be defined");
  assert.match(preview, /<code-block\s+bind-source="file\.content"/);
});
