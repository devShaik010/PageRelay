import assert from "node:assert/strict";
import { io } from "socket.io-client";
import * as Y from "yjs";

const apiUrl = process.env.API_URL || "http://127.0.0.1:4000";

function toUint8Array(payload) {
  if (payload instanceof ArrayBuffer) return new Uint8Array(payload);
  if (ArrayBuffer.isView(payload)) {
    return new Uint8Array(payload.buffer, payload.byteOffset, payload.byteLength);
  }
  if (payload?.data) return new Uint8Array(payload.data);
  return new Uint8Array(payload || []);
}

function waitFor(check, timeout = 4000) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const timer = setInterval(() => {
      if (check()) {
        clearInterval(timer);
        resolve();
      } else if (Date.now() - started > timeout) {
        clearInterval(timer);
        reject(new Error("Timed out waiting for live state"));
      }
    }, 25);
  });
}

function join(socket, code, name) {
  return new Promise((resolve) => {
    socket.emit("join-session", { code, name }, resolve);
  });
}

const createdResponse = await fetch(`${apiUrl}/api/sessions`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    title: `Compose smoke ${Date.now()}`,
    creatorName: "Alice",
  }),
});
assert.equal(createdResponse.status, 201);
const created = await createdResponse.json();
assert.match(created.code, /^[a-z0-9]{16}$/);
assert.ok(created.creatorToken);

const aliceSocket = io(apiUrl, { transports: ["websocket"] });
const bobSocket = io(apiUrl, { transports: ["websocket"] });
const aliceDoc = new Y.Doc();
const bobDoc = new Y.Doc();
const aliceText = aliceDoc.getText("content");
const bobText = bobDoc.getText("content");
let bobSawCursor = null;

aliceSocket.on("y-update", (update) => {
  Y.applyUpdate(aliceDoc, toUint8Array(update), "remote");
});
bobSocket.on("y-update", (update) => {
  Y.applyUpdate(bobDoc, toUint8Array(update), "remote");
});
bobSocket.on("cursor-update", (cursor) => {
  bobSawCursor = cursor;
});

const aliceJoin = await join(aliceSocket, created.code, "Alice");
const bobJoin = await join(bobSocket, created.code, "Bob");
assert.equal(aliceJoin.ok, true);
assert.equal(bobJoin.ok, true);
Y.applyUpdate(aliceDoc, toUint8Array(aliceJoin.update), "remote");
Y.applyUpdate(bobDoc, toUint8Array(bobJoin.update), "remote");

aliceText.insert(0, "A sentence arriving live.");
aliceSocket.emit("y-update", Y.encodeStateAsUpdate(aliceDoc));
await waitFor(() => bobText.toString() === "A sentence arriving live.");
assert.equal(bobText.toString(), aliceText.toString());

aliceSocket.emit("cursor-update", { start: 12, end: 12 });
await waitFor(() => bobSawCursor?.start === 12);
assert.equal(bobSawCursor.name, "Alice");

const unauthorizedEnd = await fetch(`${apiUrl}/api/sessions/${created.code}/end`, {
  method: "POST",
  headers: { authorization: "Bearer definitely-not-the-creator" },
});
assert.equal(unauthorizedEnd.status, 403);

const creatorEnd = await fetch(`${apiUrl}/api/sessions/${created.code}/end`, {
  method: "POST",
  headers: { authorization: `Bearer ${created.creatorToken}` },
});
assert.equal(creatorEnd.status, 200);
const endResult = await creatorEnd.json();
assert.ok(endResult.endedAt);

const charlieSocket = io(apiUrl, { transports: ["websocket"] });
const closedJoin = await join(charlieSocket, created.code, "Charlie");
assert.equal(closedJoin.ok, false);
assert.equal(closedJoin.ended, true);

const metadataResponse = await fetch(`${apiUrl}/api/sessions/${created.code}`);
const metadata = await metadataResponse.json();
assert.ok(metadata.endedAt);

aliceSocket.disconnect();
bobSocket.disconnect();
charlieSocket.disconnect();
aliceDoc.destroy();
bobDoc.destroy();

console.log("Live stack smoke test passed");
