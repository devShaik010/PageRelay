"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { io } from "socket.io-client";
import getCaretCoordinates from "textarea-caret";
import * as Y from "yjs";
import { Check, Copy, Exit, Menu, Users } from "./Icons";
import Logo from "./Logo";
import ProfileAvatar from "./ProfileAvatar";

const CONFIGURED_API_URL = (process.env.NEXT_PUBLIC_API_URL || "").replace(/\/$/, "");

function getApiUrl() {
  if (CONFIGURED_API_URL) return CONFIGURED_API_URL;
  if (typeof window === "undefined") return "http://localhost:4000";
  if (["localhost", "127.0.0.1"].includes(window.location.hostname)) {
    return `${window.location.protocol}//${window.location.hostname}:4000`;
  }
  return window.location.origin;
}

function toUint8Array(payload) {
  if (payload instanceof ArrayBuffer) return new Uint8Array(payload);
  if (ArrayBuffer.isView(payload)) {
    return new Uint8Array(payload.buffer, payload.byteOffset, payload.byteLength);
  }
  if (payload?.data) return new Uint8Array(payload.data);
  return new Uint8Array(payload || []);
}

function applyTextChange(doc, text, nextValue) {
  const current = text.toString();
  if (current === nextValue) return;

  let start = 0;
  const shortest = Math.min(current.length, nextValue.length);
  while (start < shortest && current[start] === nextValue[start]) start += 1;

  let currentEnd = current.length;
  let nextEnd = nextValue.length;
  while (
    currentEnd > start &&
    nextEnd > start &&
    current[currentEnd - 1] === nextValue[nextEnd - 1]
  ) {
    currentEnd -= 1;
    nextEnd -= 1;
  }

  doc.transact(() => {
    if (currentEnd > start) text.delete(start, currentEnd - start);
    if (nextEnd > start) text.insert(start, nextValue.slice(start, nextEnd));
  }, "local");
}

function countWords(value) {
  const trimmed = value.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

function profileColorIndex(value = "") {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash % 6;
}

function modeLabel(mode) {
  if (!mode) return "Live";
  return mode === "solo" ? "Solo" : mode === "duo" ? "Duo" : "Multi";
}

function accessSummary(metadata, role) {
  if (!metadata) return "Opening access…";
  if (role === "viewer") return "Read-only access";
  if (metadata.mode === "solo") return "Creator editing";
  if (metadata.mode === "duo") return "Two-person editing";
  if (metadata.accessPolicy === "read_only") return "Creator editing";
  if (metadata.accessPolicy === "limited") {
    return `${metadata.editorLimit} collaborator seat${metadata.editorLimit === 1 ? "" : "s"}`;
  }
  return "Open collaboration";
}

export default function Room({ code }) {
  const [metadata, setMetadata] = useState(null);
  const [name, setName] = useState("");
  const [joinName, setJoinName] = useState("");
  const [joined, setJoined] = useState(false);
  const [content, setContent] = useState("");
  const [status, setStatus] = useState("Connecting");
  const [participants, setParticipants] = useState([]);
  const [creatorToken, setCreatorToken] = useState("");
  const [role, setRole] = useState(null);
  const [accessReason, setAccessReason] = useState("");
  const [endedAt, setEndedAt] = useState(null);
  const [notice, setNotice] = useState("");
  const [copyStatus, setCopyStatus] = useState("idle");
  const [contentCopyStatus, setContentCopyStatus] = useState("idle");
  const [joinRejected, setJoinRejected] = useState("");
  const [error, setError] = useState("");
  const [showEndConfirm, setShowEndConfirm] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showPeople, setShowPeople] = useState(false);
  const [remoteCursors, setRemoteCursors] = useState({});
  const [cursorPositions, setCursorPositions] = useState([]);
  const socketRef = useRef(null);
  const docRef = useRef(null);
  const textRef = useRef(null);
  const editorRef = useRef(null);
  const cursorTimersRef = useRef({});
  const roleRef = useRef(null);

  const wordCount = useMemo(() => countWords(content), [content]);
  const canEdit = joined && role === "editor" && !endedAt;

  const refreshCursorPositions = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const positions = Object.values(remoteCursors).map((cursor) => {
      const offset = Math.min(cursor.start, editor.value.length);
      const coordinates = getCaretCoordinates(editor, offset);
      return {
        ...cursor,
        left: coordinates.left - editor.scrollLeft,
        top: coordinates.top - editor.scrollTop,
        height: coordinates.height,
        colorIndex: profileColorIndex(cursor.name),
      };
    });
    setCursorPositions(
      positions.filter(
        (cursor) =>
          cursor.top > -24 &&
          cursor.top < editor.clientHeight &&
          cursor.left > -12 &&
          cursor.left < editor.clientWidth,
      ),
    );
  }, [remoteCursors]);

  const reportCursor = useCallback(() => {
    const editor = editorRef.current;
    const socket = socketRef.current;
    if (!editor || !socket?.connected || roleRef.current !== "editor") return;
    socket.emit("cursor-update", {
      start: editor.selectionStart,
      end: editor.selectionEnd,
    });
  }, []);

  useEffect(() => {
    const frame = window.requestAnimationFrame(refreshCursorPositions);
    return () => window.cancelAnimationFrame(frame);
  }, [content, refreshCursorPositions]);

  useEffect(() => {
    const savedToken =
      localStorage.getItem(`pagerelay:creator:${code}`) ||
      localStorage.getItem(`blankroom:creator:${code}`) ||
      "";
    const savedName =
      localStorage.getItem(`pagerelay:name:${code}`) ||
      localStorage.getItem(`blankroom:name:${code}`) ||
      "";
    setCreatorToken(savedToken);
    setJoinName(savedName);
    if (savedName) setName(savedName);

    fetch(`${getApiUrl()}/api/sessions/${code}`)
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "This sheet could not be found");
        setMetadata(data);
        setEndedAt(data.endedAt);
        const opensAsViewer =
          !savedToken &&
          (data.mode === "solo" ||
            (data.mode === "multi" && data.accessPolicy === "read_only"));
        if (opensAsViewer && !savedName) setName("Viewer");
      })
      .catch((requestError) => setError(requestError.message));
  }, [code]);

  useEffect(() => {
    if (!name || endedAt) return undefined;

    const doc = new Y.Doc();
    const text = doc.getText("content");
    const socket = io(getApiUrl(), { transports: ["websocket", "polling"] });
    docRef.current = doc;
    textRef.current = text;
    socketRef.current = socket;

    const observeText = () => setContent(text.toString());
    const sendUpdate = (update, origin) => {
      if (origin === "local" && socket.connected && roleRef.current === "editor") {
        setStatus("Saving");
        socket.emit("y-update", update);
      }
    };

    text.observe(observeText);
    doc.on("update", sendUpdate);

    socket.on("connect", () => {
      setStatus("Connecting");
      socket.emit("join-session", { code, name, creatorToken }, (result) => {
        if (!result?.ok) {
          if (result?.ended) {
            setMetadata((current) => current || { title: result.title });
            setEndedAt(result.endedAt);
          } else {
            setJoinRejected(result?.error || "Could not join the session");
          }
          return;
        }
        if (result.update) Y.applyUpdate(doc, toUint8Array(result.update), "remote");
        setMetadata((current) => ({
          ...current,
          title: result.title,
          mode: result.mode,
          accessPolicy: result.accessPolicy,
          editorLimit: result.editorLimit,
        }));
        setParticipants(result.participants || []);
        roleRef.current = result.role;
        setRole(result.role);
        setAccessReason(result.accessReason || "");
        setJoined(true);
        setStatus("Live");
        if (result.accessReason === "editor_limit_reached") {
          setNotice("Editor seats are full. You joined with read-only access.");
        }
        if (result.role === "editor") {
          window.setTimeout(() => editorRef.current?.focus(), 80);
        }
      });
    });

    socket.on("y-update", (update) => {
      Y.applyUpdate(doc, toUint8Array(update), "remote");
      setStatus("Live");
    });
    socket.on("presence", (nextParticipants) => {
      setParticipants(nextParticipants);
      const activeIds = new Set(nextParticipants.map((person) => person.id));
      setRemoteCursors((current) =>
        Object.fromEntries(
          Object.entries(current).filter(([participantId]) => activeIds.has(participantId)),
        ),
      );
    });
    socket.on("cursor-update", (cursor) => {
      setRemoteCursors((current) => ({ ...current, [cursor.id]: cursor }));
      window.clearTimeout(cursorTimersRef.current[cursor.id]);
      cursorTimersRef.current[cursor.id] = window.setTimeout(() => {
        setRemoteCursors((current) => {
          const next = { ...current };
          delete next[cursor.id];
          return next;
        });
      }, 3800);
    });
    socket.on("saved", () => setStatus("Live"));
    socket.on("write-denied", ({ error: message }) => {
      roleRef.current = "viewer";
      setRole("viewer");
      setNotice(message || "This sheet is read-only for you.");
    });
    socket.on("session-ended", ({ endedAt: timestamp }) => {
      setEndedAt(timestamp);
      setNotice("The creator ended this session.");
    });
    socket.on("disconnect", () => setStatus("Offline"));
    socket.on("connect_error", () => setStatus("Reconnecting"));

    return () => {
      text.unobserve(observeText);
      doc.off("update", sendUpdate);
      socket.disconnect();
      doc.destroy();
      Object.values(cursorTimersRef.current).forEach(window.clearTimeout);
      cursorTimersRef.current = {};
      setRemoteCursors({});
      roleRef.current = null;
      socketRef.current = null;
      docRef.current = null;
      textRef.current = null;
    };
  }, [code, name, endedAt, creatorToken]);

  function joinSession(event) {
    event.preventDefault();
    const cleanName = joinName.trim();
    if (!cleanName) return;
    localStorage.setItem(`pagerelay:name:${code}`, cleanName);
    setJoinRejected("");
    setName(cleanName);
  }

  function editDocument(event) {
    setContent(event.target.value);
    if (docRef.current && textRef.current) {
      applyTextChange(docRef.current, textRef.current, event.target.value);
    }
    window.requestAnimationFrame(reportCursor);
  }

  async function copyLink() {
    const shareLink = window.location.href;
    let copied = false;

    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(shareLink);
        copied = true;
      }
    } catch {
      copied = false;
    }

    if (!copied) {
      const temporaryInput = document.createElement("textarea");
      const previouslyFocused = document.activeElement;
      try {
        temporaryInput.value = shareLink;
        temporaryInput.setAttribute("readonly", "");
        temporaryInput.style.position = "fixed";
        temporaryInput.style.opacity = "0";
        document.body.appendChild(temporaryInput);
        temporaryInput.select();
        copied = document.execCommand("copy");
      } catch {
        copied = false;
      } finally {
        temporaryInput.remove();
        previouslyFocused?.focus();
      }
    }

    if (copied) {
      setCopyStatus("copied");
      setNotice("Share link copied.");
    } else {
      setCopyStatus("failed");
      setNotice("Copy the link from your browser address bar.");
    }
    window.setTimeout(() => {
      setCopyStatus("idle");
      setNotice("");
    }, 2400);
  }

  async function copyContent() {
    let copied = false;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(content);
        copied = true;
      }
    } catch {
      copied = false;
    }

    if (!copied) {
      const temporaryInput = document.createElement("textarea");
      const previouslyFocused = document.activeElement;
      try {
        temporaryInput.value = content;
        temporaryInput.setAttribute("readonly", "");
        temporaryInput.style.position = "fixed";
        temporaryInput.style.opacity = "0";
        document.body.appendChild(temporaryInput);
        temporaryInput.select();
        copied = document.execCommand("copy");
      } catch {
        copied = false;
      } finally {
        temporaryInput.remove();
        previouslyFocused?.focus();
      }
    }

    setContentCopyStatus(copied ? "copied" : "failed");
    setNotice(copied ? "Full note copied." : "Could not copy the note.");
    window.setTimeout(() => {
      setContentCopyStatus("idle");
      setNotice("");
    }, 2400);
  }

  async function endCurrentSession() {
    setError("");
    try {
      const response = await fetch(`${getApiUrl()}/api/sessions/${code}/end`, {
        method: "POST",
        headers: { authorization: `Bearer ${creatorToken}` },
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not end the session");
      setEndedAt(data.endedAt);
      setShowEndConfirm(false);
      setNotice("Session ended. This sheet is now read-only.");
    } catch (requestError) {
      setError(requestError.message);
      setShowEndConfirm(false);
    }
  }

  if (error && !metadata) {
    return (
      <main className="state-page">
        <Logo />
        <div className="state-card" role="alert">
          <p className="eyebrow">SHEET UNAVAILABLE</p>
          <h1>There&apos;s no live page here.</h1>
          <p>{error}</p>
          <a className="primary-button" href="/">Create a new sheet</a>
        </div>
      </main>
    );
  }

  return (
    <main className="room-shell" id="editor">
      <a className="skip-link" href="#live-editor">Skip to editor</a>
      <div className="sr-only" aria-live="polite">{notice} {status}</div>

      <header className="room-floating-controls" data-od-id="room-toolbar">
        <div className="floating-control-wrap">
          <button
            className="floating-icon-button"
            onClick={() => {
              setShowMenu((current) => !current);
              setShowPeople(false);
            }}
            type="button"
            aria-label="Open session menu"
            aria-expanded={showMenu}
          >
            <Menu />
          </button>
          {showMenu && (
            <section className="floating-popover session-popover" role="dialog" aria-label="Session menu">
              <p className="popover-kicker">LIVE SESSION</p>
              <h2>{metadata?.title || "Opening sheet…"}</h2>
              <div className="session-detail">
                <span>Room code</span>
                <code>{code.slice(0, 8)}</code>
              </div>
              <div className="session-detail">
                <span>Your role</span>
                <strong>
                  {creatorToken ? "Creator" : role === "viewer" ? "Viewer" : "Collaborator"}
                </strong>
              </div>
              <div className="session-detail">
                <span>Mode</span>
                <strong>{modeLabel(metadata?.mode)} mode</strong>
              </div>
              <div className="session-detail">
                <span>Access</span>
                <strong>{accessSummary(metadata, role)}</strong>
              </div>
              <a className="popover-home-link" href="/">
                <Logo compact />
                <span>Back to PageRelay</span>
              </a>
            </section>
          )}
        </div>

        <div className="floating-actions">
          <div className={`floating-status status-${status.toLowerCase()}`} title={`Connection: ${status}`} role="status">
            <i aria-hidden="true" />
            <span>{endedAt ? "Ended" : status}</span>
          </div>

          <div className="floating-control-wrap">
            <button
              className="floating-icon-button people-button"
              onClick={() => {
                setShowPeople((current) => !current);
                setShowMenu(false);
              }}
              type="button"
              aria-label={`${participants.length} people in this sheet`}
              aria-expanded={showPeople}
            >
              <Users />
              <span className="floating-count num">{participants.length}</span>
            </button>
            {showPeople && (
              <section className="floating-popover people-popover" role="dialog" aria-label="People in this session">
                <div className="popover-heading">
                  <div>
                    <p className="popover-kicker">IN THIS SHEET</p>
                    <h2>{participants.length} {participants.length === 1 ? "person" : "people"}</h2>
                  </div>
                  <span className="online-total"><i /> Live</span>
                </div>
                <div className="people-list">
                  {participants.map((person) => (
                    <div className="person-row" key={person.id}>
                      <span className={`person-row-avatar profile-color-${profileColorIndex(person.name)}`}>
                        <ProfileAvatar seed={person.name} size={28} decorative />
                      </span>
                      <span>{person.name}</span>
                      <span className={remoteCursors[person.id] ? "person-state is-editing" : "person-state"}>
                        <i />
                        {socketRef.current?.id === person.id
                          ? "You"
                          : person.role === "viewer"
                            ? "Viewing"
                          : remoteCursors[person.id]
                            ? "Editing"
                            : "Online"}
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>

          <div className="floating-control-wrap copy-control">
            <button
              className={`floating-icon-button copy-link-button ${copyStatus === "copied" ? "is-copied" : ""}`}
              onClick={copyLink}
              type="button"
              aria-label={copyStatus === "copied" ? "Session link copied" : "Copy session link"}
              title={copyStatus === "copied" ? "Copied" : "Copy link"}
            >
              {copyStatus === "copied" ? <Check /> : <Copy />}
            </button>
            {copyStatus !== "idle" && (
              <span className={`copy-feedback ${copyStatus === "failed" ? "is-error" : ""}`} role="status">
                {copyStatus === "copied" ? "Link copied" : "Use address bar"}
              </span>
            )}
          </div>

          {creatorToken && (
            <button
              className="floating-icon-button floating-end-button"
              onClick={() => setShowEndConfirm(true)}
              disabled={Boolean(endedAt)}
              type="button"
              aria-label="End session"
              title="End session"
            >
              <Exit />
            </button>
          )}
        </div>
      </header>

      <section className="editor-stage" data-od-id="live-editor">
        {endedAt && (
          <div className="ended-banner" role="status">
            <strong>Session ended</strong>
            <span>This sheet is preserved as read-only.</span>
          </div>
        )}
        {!endedAt && joined && role === "viewer" && (
          <div className="access-banner" role="status">
            <strong>Viewing only</strong>
            <span>
              {accessReason === "editor_limit_reached"
                ? "All editor seats are occupied. You can read and copy this note."
                : "The creator has shared this note as read-only."}
            </span>
          </div>
        )}
        <div className="paper">
          <div className="document-heading">
            <div className="document-heading-row">
              <div>
                <p className="document-kicker">
                  {modeLabel(metadata?.mode).toUpperCase()} MODE · {accessSummary(metadata, role).toUpperCase()}
                </p>
                <h1>{metadata?.title || "Untitled sheet"}</h1>
              </div>
              <button
                className={`copy-content-button ${contentCopyStatus === "copied" ? "is-copied" : ""}`}
                onClick={copyContent}
                disabled={!joined || !content}
                type="button"
              >
                {contentCopyStatus === "copied" ? <Check /> : <Copy />}
                <span>
                  {contentCopyStatus === "copied"
                    ? "Copied"
                    : contentCopyStatus === "failed"
                      ? "Copy failed"
                      : "Copy all"}
                </span>
              </button>
            </div>
          </div>
          <label className="sr-only" htmlFor="live-editor">Shared live document</label>
          <div className="editor-canvas">
            <textarea
              ref={editorRef}
              id="live-editor"
              className="live-editor"
              value={content}
              onChange={editDocument}
              onSelect={reportCursor}
              onScroll={refreshCursorPositions}
              placeholder={
                joined
                  ? canEdit
                    ? "Start writing. Everyone here will see it live…"
                    : "The note is currently empty."
                  : "Waiting to join…"
              }
              disabled={!joined}
              readOnly={!canEdit}
              spellCheck="true"
              aria-describedby="editor-help"
            />
            <div className="remote-cursors-layer" aria-hidden="true">
              {cursorPositions.map((cursor) => (
                <span
                  className={`remote-cursor profile-color-${cursor.colorIndex}`}
                  key={cursor.id}
                  style={{
                    left: `${cursor.left}px`,
                    top: `${cursor.top}px`,
                    height: `${cursor.height}px`,
                  }}
                >
                  <i />
                  <strong>{cursor.name}</strong>
                </span>
              ))}
            </div>
          </div>
          <div className="paper-footer" id="editor-help">
            <span className="num">{wordCount} {wordCount === 1 ? "word" : "words"}</span>
            <span className="num">{content.length} characters</span>
            <span>
              {endedAt || role === "viewer" ? "Read only · copy enabled" : "Changes sync automatically"}
            </span>
          </div>
        </div>
      </section>

      {!name && !endedAt && metadata && (
        <div className="modal-backdrop">
          <section className="join-card" role="dialog" aria-modal="true" aria-labelledby="join-title">
            <p className="eyebrow">YOU&apos;VE BEEN INVITED</p>
            <h1 id="join-title">{metadata.title}</h1>
            <div className="join-mode-summary">
              <strong>{modeLabel(metadata.mode)} mode</strong>
              <span>{accessSummary(metadata, null)}</span>
            </div>
            <p className="join-copy">
              {metadata.mode === "duo"
                ? "This private sheet has one collaborator seat. Choose the name your partner will see."
                : "Choose the name others will see while you write."}
            </p>
            <form onSubmit={joinSession}>
              <div className="field">
                <label htmlFor="join-name">Your name</label>
                <input
                  id="join-name"
                  value={joinName}
                  onChange={(event) => setJoinName(event.target.value)}
                  maxLength={40}
                  autoComplete="name"
                  autoFocus
                  required
                />
              </div>
              <button className="primary-button" type="submit">Enter live sheet</button>
            </form>
          </section>
        </div>
      )}

      {joinRejected && metadata && (
        <div className="modal-backdrop">
          <section className="join-card" role="alertdialog" aria-modal="true" aria-labelledby="full-title">
            <p className="eyebrow">ROOM AT CAPACITY</p>
            <h1 id="full-title">This Duo is already complete.</h1>
            <p className="join-copy">{joinRejected}</p>
            <a className="primary-button" href="/">Create your own sheet</a>
          </section>
        </div>
      )}

      {endedAt && !joined && (
        <div className="modal-backdrop">
          <section className="join-card" role="dialog" aria-modal="true" aria-labelledby="ended-title">
            <p className="eyebrow">SESSION CLOSED</p>
            <h1 id="ended-title">{metadata?.title || "This live sheet"}</h1>
            <p className="join-copy">The creator ended this session. It no longer accepts collaborators or edits.</p>
            <a className="primary-button" href="/">Create a new sheet</a>
          </section>
        </div>
      )}

      {showEndConfirm && (
        <div className="modal-backdrop">
          <section className="confirm-card" role="alertdialog" aria-modal="true" aria-labelledby="end-title" aria-describedby="end-copy">
            <span className="confirm-mark num">!</span>
            <h2 id="end-title">End this session?</h2>
            <p id="end-copy">Everyone will be disconnected and this sheet will become read-only. This can&apos;t be undone.</p>
            <div className="confirm-actions">
              <button className="secondary-button" onClick={() => setShowEndConfirm(false)} type="button">Keep writing</button>
              <button className="danger-button" onClick={endCurrentSession} type="button">End session</button>
            </div>
          </section>
        </div>
      )}

      {error && metadata && <div className="error-toast" role="alert">{error}</div>}
    </main>
  );
}
