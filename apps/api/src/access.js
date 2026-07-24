export const SESSION_MODES = ["solo", "duo", "multi"];
export const MULTI_ACCESS_POLICIES = ["read_only", "anyone", "limited"];

export function sessionConfiguration({ mode, accessPolicy, editorLimit }) {
  if (mode === "solo") {
    return { mode, accessPolicy: "creator_only", editorLimit: 0 };
  }
  if (mode === "duo") {
    return { mode, accessPolicy: "duo", editorLimit: 1 };
  }
  return {
    mode: "multi",
    accessPolicy,
    editorLimit: accessPolicy === "limited" ? editorLimit : null,
  };
}

export function resolveJoinAccess({ session, isCreator, participants = [] }) {
  if (isCreator) return { allowed: true, role: "editor", reason: "creator" };

  if (session.mode === "solo") {
    return { allowed: true, role: "viewer", reason: "solo_viewer" };
  }

  const guestEditors = [...participants].filter(
    (participant) => participant.role === "editor" && !participant.isCreator,
  ).length;

  if (session.mode === "duo") {
    if (guestEditors >= 1) {
      return {
        allowed: false,
        role: null,
        reason: "duo_full",
        error: "This private Duo sheet already has its collaborator.",
      };
    }
    return { allowed: true, role: "editor", reason: "duo_collaborator" };
  }

  if (session.access_policy === "read_only") {
    return { allowed: true, role: "viewer", reason: "read_only" };
  }

  if (
    session.access_policy === "limited" &&
    guestEditors >= Number(session.editor_limit || 0)
  ) {
    return { allowed: true, role: "viewer", reason: "editor_limit_reached" };
  }

  return { allowed: true, role: "editor", reason: "multi_editor" };
}
