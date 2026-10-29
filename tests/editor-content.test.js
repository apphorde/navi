import test from "node:test";
import assert from "node:assert/strict";
import { editorContent } from "../public/editor-content.js";

test("extracts text from direct and forwarded editor change events", () => {
  assert.equal(editorContent({ detail: "updated" }), "updated");
  assert.equal(editorContent({ detail: { detail: "updated" } }), "updated");
  assert.equal(editorContent({ detail: { content: "updated" } }), "updated");
});

test("preserves empty editor content and ignores changes without content", () => {
  assert.equal(editorContent({ detail: "" }), "");
  assert.equal(editorContent({ detail: { detail: "" } }), "");
  assert.equal(editorContent({ detail: { content: "" } }), "");
  assert.equal(editorContent({ detail: {} }), undefined);
});
