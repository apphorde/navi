import test from "node:test";
import assert from "node:assert/strict";
import { streamWords } from "../src/ai.js";
import { parseSseEvent } from "../public/ai-stream.js";

test("AI stream is emitted as word-sized text chunks", async () => {
  async function* chunks() {
    yield { choices: [{ delta: { content: "hello" } }] };
    yield { choices: [{ delta: { content: " world." } }] };
  }
  const result = [];
  await streamWords(chunks(), (word) => result.push(word));
  assert.equal(result.join(""), "hello world.");
  assert.ok(result.length <= 2);
});

test("AI stream events preserve multiline text data", () => {
  assert.deepEqual(parseSseEvent("event: text\ndata: first line\ndata: second line"), {
    type: "text",
    data: "first line\nsecond line",
  });
});
