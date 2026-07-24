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

function join(socket, code, name, creatorToken) {
  return new Promise((resolve) => {
    socket.emit("join-session", { code, name, creatorToken }, resolve);
  });
}

async function createSession(configuration) {
  const response = await fetch(`${apiUrl}/api/sessions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(configuration),
  });
  assert.equal(response.status, 201);
  return response.json();
}

const createdResponse = await fetch(`${apiUrl}/api/sessions`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    title: `Compose smoke ${Date.now()}`,
    creatorName: "Alice",
    mode: "multi",
    accessPolicy: "anyone",
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

const aliceJoin = await join(aliceSocket, created.code, "Alice", created.creatorToken);
const bobJoin = await join(bobSocket, created.code, "Bob");
assert.equal(aliceJoin.ok, true);
assert.equal(bobJoin.ok, true);
assert.equal(aliceJoin.role, "editor");
assert.equal(bobJoin.role, "editor");
Y.applyUpdate(aliceDoc, toUint8Array(aliceJoin.update), "remote");
Y.applyUpdate(bobDoc, toUint8Array(bobJoin.update), "remote");

aliceText.insert(0, "A sentence arriving live.");
aliceSocket.emit("y-update", Y.encodeStateAsUpdate(aliceDoc));
await waitFor(() => bobText.toString() === "A sentence arriving live.");
assert.equal(bobText.toString(), aliceText.toString());

aliceText.insert(0, "Alice added this. ");
bobText.insert(bobText.length, " Bob added this.");
aliceSocket.emit("y-update", Y.encodeStateAsUpdate(aliceDoc));
bobSocket.emit("y-update", Y.encodeStateAsUpdate(bobDoc));
await waitFor(
  () =>
    aliceText.toString().includes("Alice added this.") &&
    aliceText.toString().includes("Bob added this.") &&
    bobText.toString() === aliceText.toString(),
);

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

const solo = await createSession({
  title: `Solo smoke ${Date.now()}`,
  creatorName: "Publisher",
  mode: "solo",
});
const soloCreator = io(apiUrl, { transports: ["websocket"] });
const soloViewer = io(apiUrl, { transports: ["websocket"] });
const soloCreatorJoin = await join(
  soloCreator,
  solo.code,
  "Publisher",
  solo.creatorToken,
);
const soloViewerJoin = await join(soloViewer, solo.code, "Viewer");
assert.equal(soloCreatorJoin.role, "editor");
assert.equal(soloViewerJoin.role, "viewer");

let viewerWriteDenied = false;
soloViewer.on("write-denied", () => {
  viewerWriteDenied = true;
});
const maliciousDoc = new Y.Doc();
maliciousDoc.getText("content").insert(0, "Viewer must not write");
soloViewer.emit("y-update", Y.encodeStateAsUpdate(maliciousDoc));
await waitFor(() => viewerWriteDenied);

const soloVerifier = io(apiUrl, { transports: ["websocket"] });
const soloVerifierJoin = await join(soloVerifier, solo.code, "Verifier");
const verifiedSoloDoc = new Y.Doc();
Y.applyUpdate(verifiedSoloDoc, toUint8Array(soloVerifierJoin.update), "remote");
assert.equal(verifiedSoloDoc.getText("content").toString(), "");

soloCreator.disconnect();
soloViewer.disconnect();
soloVerifier.disconnect();
maliciousDoc.destroy();
verifiedSoloDoc.destroy();

const duo = await createSession({
  title: `Duo smoke ${Date.now()}`,
  creatorName: "Duo owner",
  mode: "duo",
});
const duoCreator = io(apiUrl, { transports: ["websocket"] });
const duoPartner = io(apiUrl, { transports: ["websocket"] });
const duoThird = io(apiUrl, { transports: ["websocket"] });
const duoCreatorJoin = await join(
  duoCreator,
  duo.code,
  "Duo owner",
  duo.creatorToken,
);
const duoPartnerJoin = await join(duoPartner, duo.code, "Partner");
const duoThirdJoin = await join(duoThird, duo.code, "Third person");
assert.equal(duoCreatorJoin.role, "editor");
assert.equal(duoPartnerJoin.role, "editor");
assert.equal(duoThirdJoin.ok, false);
assert.equal(duoThirdJoin.full, true);
duoCreator.disconnect();
duoPartner.disconnect();
duoThird.disconnect();

const limited = await createSession({
  title: `Limited smoke ${Date.now()}`,
  creatorName: "Facilitator",
  mode: "multi",
  accessPolicy: "limited",
  editorLimit: 1,
});
const limitedCreator = io(apiUrl, { transports: ["websocket"] });
const limitedEditor = io(apiUrl, { transports: ["websocket"] });
const limitedViewer = io(apiUrl, { transports: ["websocket"] });
const limitedCreatorJoin = await join(
  limitedCreator,
  limited.code,
  "Facilitator",
  limited.creatorToken,
);
const limitedEditorJoin = await join(limitedEditor, limited.code, "Editor");
const limitedViewerJoin = await join(limitedViewer, limited.code, "Overflow");
assert.equal(limitedCreatorJoin.role, "editor");
assert.equal(limitedEditorJoin.role, "editor");
assert.equal(limitedViewerJoin.role, "viewer");
assert.equal(limitedViewerJoin.accessReason, "editor_limit_reached");
limitedCreator.disconnect();
limitedEditor.disconnect();
limitedViewer.disconnect();

console.log("Live stack smoke test passed");
