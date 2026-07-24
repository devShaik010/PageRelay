import http from "node:http";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import { Server } from "socket.io";
import * as Y from "yjs";
import { z } from "zod";
import {
  MULTI_ACCESS_POLICIES,
  resolveJoinAccess,
  sessionConfiguration,
  SESSION_MODES,
} from "./access.js";
import {
  closeStore,
  createSession,
  endSession,
  ensureSchema,
  findSession,
  safeTokenMatch,
  saveDocument,
} from "./store.js";

const port = Number(process.env.PORT || 4000);
const origins = (process.env.WEB_ORIGIN || "http://localhost:3000")
  .split(",")
  .map((origin) => origin.trim());
const isAllowedOrigin = (origin) => !origin || origins.includes(origin);

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin(origin, callback) {
      callback(null, isAllowedOrigin(origin));
    },
    methods: ["GET", "POST"],
  },
  maxHttpBufferSize: 1e6,
});

app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(
  cors({
    origin(origin, callback) {
      callback(null, isAllowedOrigin(origin));
    },
  }),
);
app.use(express.json({ limit: "32kb" }));

const codeSchema = z.string().regex(/^[a-z0-9]{16}$/);
const createSchema = z.object({
  title: z.string().trim().min(1).max(80),
  creatorName: z.string().trim().min(1).max(40),
  mode: z.enum(SESSION_MODES),
  accessPolicy: z.enum(MULTI_ACCESS_POLICIES).optional(),
  editorLimit: z.number().int().min(1).max(20).nullable().optional(),
});
const joinSchema = z.object({
  code: codeSchema,
  name: z.string().trim().min(1).max(40),
  creatorToken: z.string().max(100).optional(),
});
app.get("/health", (_request, response) => {
  response.json({ ok: true });
});

app.post("/api/sessions", async (request, response, next) => {
  try {
    const payload = createSchema.parse(request.body);
    const requestedPolicy = payload.accessPolicy || "anyone";
    if (
      payload.mode === "multi" &&
      requestedPolicy === "limited" &&
      !payload.editorLimit
    ) {
      return response.status(400).json({
        error: "Choose how many collaborators can edit this sheet",
      });
    }
    const configuration = sessionConfiguration({
      mode: payload.mode,
      accessPolicy: requestedPolicy,
      editorLimit: payload.editorLimit,
    });
    const session = await createSession({ ...payload, ...configuration });
    response.status(201).json({
      code: session.code,
      title: session.title,
      creatorName: session.creator_name,
      creatorToken: session.creatorToken,
      mode: session.mode,
      accessPolicy: session.access_policy,
      editorLimit: session.editor_limit,
      createdAt: session.created_at,
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/sessions/:code", async (request, response, next) => {
  try {
    const code = codeSchema.parse(request.params.code);
    const session = await findSession(code);
    if (!session) return response.status(404).json({ error: "Session not found" });
    response.json({
      code: session.code,
      title: session.title,
      creatorName: session.creator_name,
      mode: session.mode,
      accessPolicy: session.access_policy,
      editorLimit: session.editor_limit,
      endedAt: session.ended_at,
      createdAt: session.created_at,
      updatedAt: session.updated_at,
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/sessions/:code/end", async (request, response, next) => {
  try {
    const code = codeSchema.parse(request.params.code);
    const token = request.get("authorization")?.replace(/^Bearer\s+/i, "");
    const session = await findSession(code, { includeSecret: true });
    if (!session) return response.status(404).json({ error: "Session not found" });
    if (!safeTokenMatch(token, session.creator_token_hash)) {
      return response.status(403).json({ error: "Only the session creator can end it" });
    }
    const result = await endSession(code);
    io.to(roomKey(code)).emit("session-ended", { endedAt: result.ended_at });
    response.json({ endedAt: result.ended_at });
  } catch (error) {
    next(error);
  }
});

app.use((error, _request, response, _next) => {
  if (error instanceof z.ZodError) {
    return response.status(400).json({
      error: "Please check the submitted details",
      fields: error.flatten().fieldErrors,
    });
  }
  console.error(error);
  response.status(500).json({ error: "Something went wrong" });
});

const rooms = new Map();
const roomLoads = new Map();
const participants = new Map();
const richContentField = "richContent";

function roomKey(code) {
  return `session:${code}`;
}

function publicParticipants(code) {
  return [...(participants.get(code)?.values() || [])].map(
    ({ id, name, role, isCreator }) => ({
      id,
      name,
      role,
      isCreator,
    }),
  );
}

async function loadRoom(code) {
  if (rooms.has(code)) return rooms.get(code);
  if (roomLoads.has(code)) return roomLoads.get(code);

  const loading = (async () => {
    const session = await findSession(code, { includeSecret: true });
    if (!session) return null;
    const doc = new Y.Doc();
    if (session.doc_state?.length) {
      Y.applyUpdate(doc, new Uint8Array(session.doc_state), "database");
    }
    const legacyText = doc.getText("content");
    const richContent = doc.getXmlFragment(richContentField);
    if (richContent.length === 0 && legacyText.length > 0) {
      doc.transact(() => {
        const paragraph = new Y.XmlElement("paragraph");
        const text = new Y.XmlText();
        text.insert(0, legacyText.toString());
        paragraph.insert(0, [text]);
        richContent.insert(0, [paragraph]);
      }, "legacy-migration");
      await saveDocument(code, Y.encodeStateAsUpdate(doc));
    }
    const room = { doc, dirtyTimer: null };
    rooms.set(code, room);
    return room;
  })().finally(() => roomLoads.delete(code));

  roomLoads.set(code, loading);
  return loading;
}

function scheduleSave(code, room) {
  clearTimeout(room.dirtyTimer);
  room.dirtyTimer = setTimeout(async () => {
    try {
      await saveDocument(code, Y.encodeStateAsUpdate(room.doc));
    } catch (error) {
      console.error(`Failed to persist ${code}`, error);
    }
  }, 450);
}

io.on("connection", (socket) => {
  socket.on("join-session", async (payload, acknowledge = () => {}) => {
    try {
      const { code, name, creatorToken } = joinSchema.parse(payload);
      const session = await findSession(code, { includeSecret: true });
      if (!session) return acknowledge({ ok: false, error: "Session not found" });
      if (session.ended_at) {
        return acknowledge({
          ok: false,
          ended: true,
          endedAt: session.ended_at,
          title: session.title,
        });
      }

      const room = await loadRoom(code);
      if (!room) return acknowledge({ ok: false, error: "Session not found" });
      clearTimeout(room.dirtyTimer);
      room.dirtyTimer = null;

      if (!participants.has(code)) participants.set(code, new Map());
      const isCreator = safeTokenMatch(creatorToken, session.creator_token_hash);
      const access = resolveJoinAccess({
        session,
        isCreator,
        participants: participants.get(code).values(),
      });
      if (!access.allowed) {
        return acknowledge({
          ok: false,
          full: access.reason === "duo_full",
          error: access.error,
          mode: session.mode,
        });
      }

      socket.join(roomKey(code));
      socket.data.code = code;
      socket.data.name = name;
      socket.data.role = access.role;
      socket.data.isCreator = isCreator;
      participants.get(code).set(socket.id, {
        id: socket.id,
        name,
        role: access.role,
        isCreator,
      });

      acknowledge({
        ok: true,
        title: session.title,
        mode: session.mode,
        accessPolicy: session.access_policy,
        editorLimit: session.editor_limit,
        role: access.role,
        accessReason: access.reason,
        update: Buffer.from(Y.encodeStateAsUpdate(room.doc)),
        participants: publicParticipants(code),
      });
      io.to(roomKey(code)).emit("presence", publicParticipants(code));
      socket.to(roomKey(code)).emit("awareness-query");
    } catch (error) {
      acknowledge({ ok: false, error: "Unable to join this session" });
    }
  });

  socket.on("y-update", async (payload) => {
    const code = socket.data.code;
    if (!code || !payload) return;
    if (socket.data.role !== "editor") {
      socket.emit("write-denied", {
        error: "This sheet is read-only for you.",
      });
      return;
    }
    const session = await findSession(code);
    if (!session || session.ended_at) return;
    const room = rooms.get(code);
    if (!room) return;

    const update = new Uint8Array(payload);
    Y.applyUpdate(room.doc, update, socket.id);
    scheduleSave(code, room);
    socket.to(roomKey(code)).emit("y-update", Buffer.from(update));
    socket.emit("saved");
  });

  socket.on("awareness-update", (payload) => {
    const code = socket.data.code;
    const clientId = payload?.clientId;
    const update = payload?.update;
    if (!code || !Number.isSafeInteger(clientId) || !update) return;

    const binary = Buffer.isBuffer(update)
      ? update
      : update instanceof ArrayBuffer
        ? Buffer.from(update)
        : ArrayBuffer.isView(update)
          ? Buffer.from(update.buffer, update.byteOffset, update.byteLength)
          : update?.data
            ? Buffer.from(update.data)
            : null;
    if (!binary || binary.byteLength > 32_768) return;

    socket.data.awarenessClientId = clientId;
    socket.to(roomKey(code)).emit("awareness-update", binary);
  });

  socket.on("disconnect", async () => {
    const code = socket.data.code;
    if (!code) return;
    if (Number.isSafeInteger(socket.data.awarenessClientId)) {
      io.to(roomKey(code)).emit(
        "awareness-remove",
        socket.data.awarenessClientId,
      );
    }
    participants.get(code)?.delete(socket.id);
    if (participants.get(code)?.size === 0) participants.delete(code);
    io.to(roomKey(code)).emit("presence", publicParticipants(code));

    const room = rooms.get(code);
    if (!room) return;
    clearTimeout(room.dirtyTimer);
    await saveDocument(code, Y.encodeStateAsUpdate(room.doc)).catch(console.error);
    if (!participants.has(code)) {
      room.dirtyTimer = setTimeout(() => {
        rooms.get(code)?.doc.destroy();
        rooms.delete(code);
      }, 30_000);
    }
  });
});

await ensureSchema();
server.listen(port, "0.0.0.0", () => {
  console.log(`PageRelay API listening on ${port}`);
});

async function shutdown() {
  for (const [code, room] of rooms) {
    await saveDocument(code, Y.encodeStateAsUpdate(room.doc)).catch(console.error);
  }
  io.close();
  server.close();
  await closeStore();
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
