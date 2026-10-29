import test from "node:test";
import assert from "node:assert/strict";
import { requestOrigin } from "../src/origin.js";

test("origin uses forwarded HTTPS headers for OIDC callbacks", () => {
  assert.equal(
    requestOrigin(
      { headers: { host: "container:3000", "x-forwarded-proto": "https", "x-forwarded-host": "navi.example.test" } },
      { trustProxy: true },
    ),
    "https://navi.example.test",
  );
  assert.equal(
    requestOrigin({ headers: { forwarded: "proto=https;host=navi.example.test" } }, { trustProxy: true }),
    "https://navi.example.test",
  );
});

test("origin ignores forwarded headers unless the proxy is trusted", () => {
  assert.equal(
    requestOrigin({
      headers: { host: "navi.example.test", "x-forwarded-proto": "https", "x-forwarded-host": "attacker.test" },
      socket: { encrypted: false },
    }),
    "http://navi.example.test",
  );
});

test("origin rejects host values containing URL components", () => {
  assert.throws(() => requestOrigin({ headers: { host: "navi.example.test/path" } }), /Invalid request origin/);
  assert.throws(
    () => requestOrigin({ headers: { host: "navi.example.test?redirect=attacker.test" } }),
    /Invalid request origin/,
  );
});
