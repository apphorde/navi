import test from "node:test";
import assert from "node:assert/strict";
import { parsePublicOrigin, requestOrigin } from "../src/origin.js";

test("public origin is validated and normalized", () => {
  assert.equal(parsePublicOrigin("https://navi.example.test/"), "https://navi.example.test");
  assert.equal(parsePublicOrigin("http://localhost:3000"), "http://localhost:3000");
  for (const value of [
    "",
    " ",
    "ftp://navi.example.test",
    "https://user@navi.example.test",
    "https://navi.example.test/path",
    "https://navi.example.test?query=1",
    "https://navi.example.test#fragment",
    "https://navi.example.test?",
    "https://navi.example.test#",
  ]) {
    assert.throws(() => parsePublicOrigin(value), /Invalid public origin/);
  }
});

test("configured public origin overrides untrusted ingress request headers", () => {
  assert.equal(
    requestOrigin(
      {
        headers: { host: "container:3000", "x-forwarded-proto": "http", "x-forwarded-host": "internal.test" },
        socket: { encrypted: false },
      },
      { publicOrigin: "https://navi.lab.apphor.de" },
    ),
    "https://navi.lab.apphor.de",
  );
});

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
