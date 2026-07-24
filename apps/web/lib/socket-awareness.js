import {
  Awareness,
  applyAwarenessUpdate,
  encodeAwarenessUpdate,
  removeAwarenessStates,
} from "y-protocols/awareness"

function toUint8Array(payload) {
  if (payload instanceof ArrayBuffer) return new Uint8Array(payload)
  if (ArrayBuffer.isView(payload)) {
    return new Uint8Array(payload.buffer, payload.byteOffset, payload.byteLength)
  }
  if (payload?.data) return new Uint8Array(payload.data)
  return new Uint8Array(payload || [])
}

export function createSocketAwarenessProvider(document, socket) {
  const awareness = new Awareness(document)

  const sendAwareness = ({ added, updated, removed }, origin) => {
    if (origin !== "local" || !socket.connected) return
    const clients = [...added, ...updated, ...removed]
    if (!clients.length) return
    socket.emit("awareness-update", {
      clientId: document.clientID,
      update: encodeAwarenessUpdate(awareness, clients),
    })
  }

  const receiveAwareness = (update) => {
    try {
      applyAwarenessUpdate(awareness, toUint8Array(update), "remote")
    } catch {
      // Ignore malformed ephemeral presence packets without affecting the document.
    }
  }

  const answerAwarenessQuery = () => {
    const localState = awareness.getLocalState()
    if (!localState) return
    socket.emit("awareness-update", {
      clientId: document.clientID,
      update: encodeAwarenessUpdate(awareness, [document.clientID]),
    })
  }

  const removeAwareness = (clientId) => {
    if (Number.isSafeInteger(clientId)) {
      removeAwarenessStates(awareness, [clientId], "remote")
    }
  }

  awareness.on("update", sendAwareness)
  socket.on("awareness-update", receiveAwareness)
  socket.on("awareness-query", answerAwarenessQuery)
  socket.on("awareness-remove", removeAwareness)

  return {
    awareness,
    destroy() {
      awareness.setLocalState(null)
      awareness.off("update", sendAwareness)
      socket.off("awareness-update", receiveAwareness)
      socket.off("awareness-query", answerAwarenessQuery)
      socket.off("awareness-remove", removeAwareness)
    },
  }
}
