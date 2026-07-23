import assert from "node:assert/strict";
import test from "node:test";
import { createCode, createToken, hashToken, safeTokenMatch } from "../src/store.js";

test("session codes are URL-safe and have stable entropy", () => {
  const codes = new Set(Array.from({ length: 100 }, createCode));
  assert.equal(codes.size, 100);
  for (const code of codes) assert.match(code, /^[a-z0-9]{16}$/);
});

test("creator tokens are only accepted by their stored hash", () => {
  const token = createToken();
  const hash = hashToken(token);
  assert.equal(safeTokenMatch(token, hash), true);
  assert.equal(safeTokenMatch(`${token}x`, hash), false);
  assert.equal(safeTokenMatch("", hash), false);
});
