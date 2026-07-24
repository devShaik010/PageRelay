import crypto from "node:crypto";
import pg from "pg";

const { Pool } = pg;

export const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ||
    "postgresql://blankroom:blankroom_local@localhost:5432/blankroom",
  max: 12,
});

export async function ensureSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS sessions (
      id BIGSERIAL PRIMARY KEY,
      code VARCHAR(24) UNIQUE NOT NULL,
      title VARCHAR(80) NOT NULL,
      creator_name VARCHAR(40) NOT NULL,
      creator_token_hash CHAR(64) NOT NULL,
      mode VARCHAR(10) NOT NULL DEFAULT 'multi',
      access_policy VARCHAR(20) NOT NULL DEFAULT 'anyone',
      editor_limit SMALLINT,
      doc_state BYTEA,
      ended_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    ALTER TABLE sessions ADD COLUMN IF NOT EXISTS mode VARCHAR(10) NOT NULL DEFAULT 'multi';
    ALTER TABLE sessions ADD COLUMN IF NOT EXISTS access_policy VARCHAR(20) NOT NULL DEFAULT 'anyone';
    ALTER TABLE sessions ADD COLUMN IF NOT EXISTS editor_limit SMALLINT;

    CREATE INDEX IF NOT EXISTS sessions_code_idx ON sessions (code);
  `);
}

export function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function safeTokenMatch(token, expectedHash) {
  if (!token || !expectedHash) return false;
  const actual = Buffer.from(hashToken(token), "utf8");
  const expected = Buffer.from(expectedHash, "utf8");
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

export function createCode() {
  return crypto
    .randomBytes(12)
    .toString("base64url")
    .toLowerCase()
    .replaceAll("_", "a")
    .replaceAll("-", "b");
}

export function createToken() {
  return crypto.randomBytes(32).toString("base64url");
}

export async function createSession({
  title,
  creatorName,
  mode,
  accessPolicy,
  editorLimit,
}) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const code = createCode();
    const creatorToken = createToken();
    try {
      const result = await pool.query(
        `INSERT INTO sessions (
           code,
           title,
           creator_name,
           creator_token_hash,
           mode,
           access_policy,
           editor_limit
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING code, title, creator_name, mode, access_policy, editor_limit, created_at`,
        [
          code,
          title,
          creatorName,
          hashToken(creatorToken),
          mode,
          accessPolicy,
          editorLimit,
        ],
      );
      return { ...result.rows[0], creatorToken };
    } catch (error) {
      if (error.code !== "23505") throw error;
    }
  }
  throw new Error("Could not allocate a unique session code");
}

export async function findSession(code, { includeSecret = false } = {}) {
  const columns = includeSecret
    ? "code, title, creator_name, creator_token_hash, mode, access_policy, editor_limit, doc_state, ended_at, created_at, updated_at"
    : "code, title, creator_name, mode, access_policy, editor_limit, ended_at, created_at, updated_at";
  const result = await pool.query(
    `SELECT ${columns} FROM sessions WHERE code = $1 LIMIT 1`,
    [code],
  );
  return result.rows[0] || null;
}

export async function endSession(code) {
  const result = await pool.query(
    `UPDATE sessions
     SET ended_at = COALESCE(ended_at, NOW()), updated_at = NOW()
     WHERE code = $1
     RETURNING ended_at`,
    [code],
  );
  return result.rows[0] || null;
}

export async function saveDocument(code, update) {
  await pool.query(
    `UPDATE sessions SET doc_state = $2, updated_at = NOW() WHERE code = $1`,
    [code, Buffer.from(update)],
  );
}

export async function closeStore() {
  await pool.end();
}
