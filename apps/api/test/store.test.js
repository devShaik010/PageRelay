import assert from "node:assert/strict";
import test from "node:test";
import { resolveJoinAccess, sessionConfiguration } from "../src/access.js";
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

test("session modes normalize to enforceable access policies", () => {
  assert.deepEqual(
    sessionConfiguration({
      mode: "solo",
      accessPolicy: "anyone",
      editorLimit: 8,
    }),
    { mode: "solo", accessPolicy: "creator_only", editorLimit: 0 },
  );
  assert.deepEqual(
    sessionConfiguration({
      mode: "duo",
      accessPolicy: "read_only",
      editorLimit: 8,
    }),
    { mode: "duo", accessPolicy: "duo", editorLimit: 1 },
  );
  assert.deepEqual(
    sessionConfiguration({
      mode: "multi",
      accessPolicy: "limited",
      editorLimit: 3,
    }),
    { mode: "multi", accessPolicy: "limited", editorLimit: 3 },
  );
});

test("solo guests and read-only multi guests cannot edit", () => {
  const solo = resolveJoinAccess({
    session: { mode: "solo", access_policy: "creator_only" },
    isCreator: false,
  });
  const multi = resolveJoinAccess({
    session: { mode: "multi", access_policy: "read_only" },
    isCreator: false,
  });
  assert.equal(solo.role, "viewer");
  assert.equal(multi.role, "viewer");
});

test("duo mode allows one guest editor and rejects a third participant", () => {
  const firstGuest = resolveJoinAccess({
    session: { mode: "duo", access_policy: "duo" },
    isCreator: false,
    participants: [{ role: "editor", isCreator: true }],
  });
  const thirdParticipant = resolveJoinAccess({
    session: { mode: "duo", access_policy: "duo" },
    isCreator: false,
    participants: [
      { role: "editor", isCreator: true },
      { role: "editor", isCreator: false },
    ],
  });
  assert.equal(firstGuest.role, "editor");
  assert.equal(thirdParticipant.allowed, false);
  assert.equal(thirdParticipant.reason, "duo_full");
});

test("limited multi mode turns overflow guests into viewers", () => {
  const available = resolveJoinAccess({
    session: { mode: "multi", access_policy: "limited", editor_limit: 2 },
    isCreator: false,
    participants: [{ role: "editor", isCreator: false }],
  });
  const full = resolveJoinAccess({
    session: { mode: "multi", access_policy: "limited", editor_limit: 2 },
    isCreator: false,
    participants: [
      { role: "editor", isCreator: false },
      { role: "editor", isCreator: false },
    ],
  });
  assert.equal(available.role, "editor");
  assert.equal(full.role, "viewer");
  assert.equal(full.reason, "editor_limit_reached");
});

test("creator always receives editor access", () => {
  const result = resolveJoinAccess({
    session: { mode: "solo", access_policy: "creator_only" },
    isCreator: true,
    participants: [],
  });
  assert.equal(result.allowed, true);
  assert.equal(result.role, "editor");
});
