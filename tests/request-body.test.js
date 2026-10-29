import test from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { MAX_REQUEST_BODY_BYTES, readJsonBody } from "../src/request-body.js";

function requestWith(chunks, headers = {}) {
  const request = Readable.from(chunks);
  request.headers = headers;
  return request;
}

test("JSON request bodies parse and reject malformed JSON", async () => {
  assert.deepEqual(await readJsonBody(requestWith([Buffer.from('{"ok":true}')])), { ok: true });
  await assert.rejects(
    () => readJsonBody(requestWith([Buffer.from("not json")])),
    (error) => error.status === 400,
  );
  await assert.rejects(
    () => readJsonBody(requestWith([Buffer.from("null")])),
    (error) => error.status === 400,
  );
});

test("JSON request bodies are limited by received bytes", async () => {
  const request = requestWith([Buffer.alloc(MAX_REQUEST_BODY_BYTES + 1)]);
  await assert.rejects(
    () => readJsonBody(request),
    (error) => error.status === 413,
  );
});

test("oversized Content-Length is rejected before buffering", async () => {
  const request = requestWith([], { "content-length": String(MAX_REQUEST_BODY_BYTES + 1) });
  await assert.rejects(
    () => readJsonBody(request),
    (error) => error.status === 413,
  );
});
