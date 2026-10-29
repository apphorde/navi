import test from "node:test";
import assert from "node:assert/strict";
import { mutationRequestError } from "../src/request-security.js";

test("same-origin JSON mutations are accepted while cross-origin requests are rejected", () => {
  assert.equal(
    mutationRequestError(
      { method: "PUT", headers: { origin: "https://navi.example.test", "content-type": "application/json" } },
      "https://navi.example.test",
    ),
    null,
  );
  assert.equal(
    mutationRequestError(
      { method: "POST", headers: { origin: "https://attacker.test", "content-type": "application/json" } },
      "https://navi.example.test",
    ).status,
    403,
  );
  assert.equal(
    mutationRequestError(
      { method: "POST", headers: { origin: "https://navi.example.test", "content-type": "text/plain" } },
      "https://navi.example.test",
    ).status,
    415,
  );
});

test("safe methods do not require mutation headers", () => {
  assert.equal(mutationRequestError({ method: "GET", headers: {} }), null);
});
