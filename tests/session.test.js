import test from "node:test";
import assert from "node:assert/strict";
import { createSessions, parseCookies } from "../src/session.js";

test("sessions sign, expire, update, and remove values", () => {
  const sessions = createSessions("test-secret");
  const issued = sessions.issue({ answer: 42 }, 10);
  const value = sessions.read(issued.value);
  assert.equal(value.answer, 42);
  sessions.update(value.id, { next: true });
  assert.equal(sessions.read(issued.value).next, true);
  sessions.remove(value.id);
  assert.equal(sessions.read(issued.value), null);
  assert.equal(sessions.read(`${issued.value}x`), null);
});

test("cookie parsing ignores malformed percent escapes", () => {
  assert.deepEqual(parseCookies({ headers: { cookie: "invalid=%E0%A4%A; navi_session=valid" } }), {
    navi_session: "valid",
  });
});
