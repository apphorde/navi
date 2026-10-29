import test from "node:test";
import assert from "node:assert/strict";
import { createShareUrl } from "../public/share-url.js";

test("creates a share URL with the workspace path and preserves other URL parts", () => {
  const shareUrl = new URL(createShareUrl("https://navi.example/?theme=dark&p=old#editor", "docs/read me.txt"));

  assert.equal(shareUrl.origin, "https://navi.example");
  assert.equal(shareUrl.searchParams.get("theme"), "dark");
  assert.equal(shareUrl.searchParams.get("p"), "/docs/read me.txt");
  assert.equal(shareUrl.hash, "#editor");
});

test("rejects unsafe paths when creating a share URL", () => {
  assert.throws(() => createShareUrl("https://navi.example/", "../secret"), TypeError);
});
