import test from 'node:test';
import assert from 'node:assert/strict';
import { requestOrigin } from '../src/origin.js';

test('origin uses forwarded HTTPS headers for OIDC callbacks', () => {
  assert.equal(requestOrigin({ headers: { host: 'container:3000', 'x-forwarded-proto': 'https', 'x-forwarded-host': 'navi.example.test' } }), 'https://navi.example.test');
  assert.equal(requestOrigin({ headers: { forwarded: 'proto=https;host=navi.example.test' } }), 'https://navi.example.test');
});
