import { createPool } from "mysql2/promise"
import type {
  Pool,
  PoolConnection,
  ResultSetHeader,
  RowDataPacket,
} from "mysql2/promise"
import type { PersistedChatState, SessionFile } from "@/lib/chat-types"

export type DatabaseUser = {
  id: string
  email: string
  name: string
  passwordHash: string
  createdAt: string
}

type UserRow = RowDataPacket & {
  id: string
  email: string
  name: string
  password_hash: string
  created_at: Date
}

type ChatStateRow = RowDataPacket & {
  state_json: PersistedChatState | string
  revision: number
}

type FileRow = RowDataPacket & {
  id: string
  conversation_id: string
  name: string
  mime_type: string
  size: number
  content: Buffer
  created_at: Date
}

declare global {
  var __lumyDatabasePool: Pool | undefined
  var __lumyDatabaseSchemaReady: Promise<void> | undefined
}

function getDatabaseUrl() {
  return process.env.DATABASE_URL?.trim()
}

function parseDatabaseUrl(rawUrl: string) {
  const normalized = rawUrl.replace(/^jdbc:/, "")
  const url = new URL(normalized)

  if (url.protocol !== "mysql:") {
    throw new Error(
      "DATABASE_URL doit utiliser le protocole mysql:// ou jdbc:mysql://"
    )
  }

  const database = decodeURIComponent(url.pathname.replace(/^\//, ""))
  if (!url.hostname || !url.username || !database) {
    throw new Error("DATABASE_URL est incomplète.")
  }

  return {
    host: url.hostname,
    port: Number(url.port || 3306),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database,
  }
}

export function isDatabaseConfigured() {
  return Boolean(getDatabaseUrl())
}

export function getDatabasePool() {
  const rawUrl = getDatabaseUrl()
  if (!rawUrl) throw new Error("DATABASE_URL n’est pas configurée.")

  if (!globalThis.__lumyDatabasePool) {
    globalThis.__lumyDatabasePool = createPool({
      ...parseDatabaseUrl(rawUrl),
      waitForConnections: true,
      connectionLimit: 10,
      maxIdle: 10,
      idleTimeout: 60_000,
      queueLimit: 0,
      enableKeepAlive: true,
      keepAliveInitialDelay: 0,
      charset: "utf8mb4",
      timezone: "Z",
    })
  }

  return globalThis.__lumyDatabasePool
}

const schemaStatements = [
  `CREATE TABLE IF NOT EXISTS lumy_users (
    id CHAR(36) NOT NULL PRIMARY KEY,
    email VARCHAR(191) NOT NULL UNIQUE,
    name VARCHAR(100) NOT NULL,
    password_hash VARCHAR(100) NOT NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
      ON UPDATE CURRENT_TIMESTAMP(3)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS lumy_sessions (
    id CHAR(36) NOT NULL PRIMARY KEY,
    token_hash CHAR(64) NOT NULL UNIQUE,
    user_id CHAR(36) NOT NULL,
    expires_at DATETIME(3) NOT NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX idx_lumy_sessions_user (user_id),
    INDEX idx_lumy_sessions_expiry (expires_at),
    CONSTRAINT fk_lumy_sessions_user FOREIGN KEY (user_id)
      REFERENCES lumy_users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS lumy_chat_state (
    workspace_id VARCHAR(64) NOT NULL PRIMARY KEY,
    state_json JSON NOT NULL,
    revision BIGINT UNSIGNED NOT NULL DEFAULT 1,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
      ON UPDATE CURRENT_TIMESTAMP(3)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS lumy_files (
    id CHAR(36) NOT NULL PRIMARY KEY,
    user_id CHAR(36) NOT NULL,
    conversation_id VARCHAR(64) NOT NULL,
    name VARCHAR(255) NOT NULL,
    mime_type VARCHAR(191) NOT NULL,
    size INT UNSIGNED NOT NULL,
    content LONGBLOB NOT NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX idx_lumy_files_user (user_id),
    INDEX idx_lumy_files_conversation (conversation_id),
    CONSTRAINT fk_lumy_files_user FOREIGN KEY (user_id)
      REFERENCES lumy_users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
]

export function ensureDatabaseSchema() {
  if (!globalThis.__lumyDatabaseSchemaReady) {
    globalThis.__lumyDatabaseSchemaReady = (async () => {
      const pool = getDatabasePool()
      for (const statement of schemaStatements) await pool.execute(statement)
      await pool.execute(
        "DELETE FROM lumy_sessions WHERE expires_at <= CURRENT_TIMESTAMP(3)"
      )
    })().catch((error) => {
      globalThis.__lumyDatabaseSchemaReady = undefined
      throw error
    })
  }
  return globalThis.__lumyDatabaseSchemaReady
}

export async function checkDatabase() {
  await ensureDatabaseSchema()
  await getDatabasePool().execute("SELECT 1")
  return { connected: true as const }
}

function mapUser(row: UserRow): DatabaseUser {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    passwordHash: row.password_hash,
    createdAt: row.created_at.toISOString(),
  }
}

export async function findUserByEmail(email: string) {
  await ensureDatabaseSchema()
  const [rows] = await getDatabasePool().execute<UserRow[]>(
    "SELECT id, email, name, password_hash, created_at FROM lumy_users WHERE email = ? LIMIT 1",
    [email]
  )
  const row = rows.at(0)
  return row ? mapUser(row) : null
}

export async function findUserBySessionHash(tokenHash: string) {
  await ensureDatabaseSchema()
  const [rows] = await getDatabasePool().execute<UserRow[]>(
    `SELECT u.id, u.email, u.name, u.password_hash, u.created_at
      FROM lumy_sessions s
      INNER JOIN lumy_users u ON u.id = s.user_id
      WHERE s.token_hash = ? AND s.expires_at > CURRENT_TIMESTAMP(3)
      LIMIT 1`,
    [tokenHash]
  )
  const row = rows.at(0)
  return row ? mapUser(row) : null
}

export async function insertUser(user: {
  id: string
  email: string
  name: string
  passwordHash: string
}) {
  await ensureDatabaseSchema()
  await getDatabasePool().execute(
    "INSERT INTO lumy_users (id, email, name, password_hash) VALUES (?, ?, ?, ?)",
    [user.id, user.email, user.name, user.passwordHash]
  )
}

export async function insertSession(session: {
  id: string
  tokenHash: string
  userId: string
  expiresAt: Date
}) {
  await ensureDatabaseSchema()
  await getDatabasePool().execute(
    "INSERT INTO lumy_sessions (id, token_hash, user_id, expires_at) VALUES (?, ?, ?, ?)",
    [session.id, session.tokenHash, session.userId, session.expiresAt]
  )
}

export async function deleteSessionByHash(tokenHash: string) {
  await ensureDatabaseSchema()
  await getDatabasePool().execute(
    "DELETE FROM lumy_sessions WHERE token_hash = ?",
    [tokenHash]
  )
}

export async function updateUser(input: {
  id: string
  name: string
  email: string
  passwordHash?: string
}) {
  await ensureDatabaseSchema()
  if (input.passwordHash) {
    await getDatabasePool().execute(
      "UPDATE lumy_users SET name = ?, email = ?, password_hash = ? WHERE id = ?",
      [input.name, input.email, input.passwordHash, input.id]
    )
  } else {
    await getDatabasePool().execute(
      "UPDATE lumy_users SET name = ?, email = ? WHERE id = ?",
      [input.name, input.email, input.id]
    )
  }
}

async function withTransaction<T>(
  callback: (connection: PoolConnection) => Promise<T>
) {
  const connection = await getDatabasePool().getConnection()
  try {
    await connection.beginTransaction()
    const result = await callback(connection)
    await connection.commit()
    return result
  } catch (error) {
    await connection.rollback()
    throw error
  } finally {
    connection.release()
  }
}

export async function deleteUserAccount(userId: string) {
  await ensureDatabaseSchema()
  await withTransaction(async (connection) => {
    await connection.execute(
      "DELETE FROM lumy_chat_state WHERE workspace_id = ?",
      [userId]
    )
    await connection.execute("DELETE FROM lumy_users WHERE id = ?", [userId])
  })
}

export async function readChatState(workspaceId: string) {
  await ensureDatabaseSchema()
  const [rows] = await getDatabasePool().execute<ChatStateRow[]>(
    "SELECT state_json, revision FROM lumy_chat_state WHERE workspace_id = ? LIMIT 1",
    [workspaceId]
  )
  const row = rows.at(0)
  if (!row) return null
  const state =
    typeof row.state_json === "string"
      ? (JSON.parse(row.state_json) as PersistedChatState)
      : row.state_json
  return { state, revision: Number(row.revision) }
}

export async function writeChatState(
  workspaceId: string,
  state: PersistedChatState
) {
  await ensureDatabaseSchema()
  await getDatabasePool().execute(
    `INSERT INTO lumy_chat_state (workspace_id, state_json)
      VALUES (?, ?)
      ON DUPLICATE KEY UPDATE
        state_json = VALUES(state_json),
        revision = revision + 1`,
    [workspaceId, JSON.stringify(state)]
  )
}

export async function insertFile(input: {
  id: string
  userId: string
  conversationId: string
  name: string
  type: string
  size: number
  content: Buffer
}) {
  await ensureDatabaseSchema()
  await getDatabasePool().execute(
    `INSERT INTO lumy_files
      (id, user_id, conversation_id, name, mime_type, size, content)
      VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      input.id,
      input.userId,
      input.conversationId,
      input.name,
      input.type,
      input.size,
      input.content,
    ]
  )
}

export async function findFile(userId: string, fileId: string) {
  await ensureDatabaseSchema()
  const [rows] = await getDatabasePool().execute<FileRow[]>(
    `SELECT id, conversation_id, name, mime_type, size, content, created_at
      FROM lumy_files WHERE id = ? AND user_id = ? LIMIT 1`,
    [fileId, userId]
  )
  return rows.at(0) ?? null
}

export async function deleteFile(userId: string, fileId: string) {
  await ensureDatabaseSchema()
  const [result] = await getDatabasePool().execute<ResultSetHeader>(
    "DELETE FROM lumy_files WHERE id = ? AND user_id = ?",
    [fileId, userId]
  )
  return result.affectedRows > 0
}

export async function getTextFileContext(userId: string, fileIds: string[]) {
  if (fileIds.length === 0) return []
  await ensureDatabaseSchema()
  const placeholders = fileIds.map(() => "?").join(",")
  const [rows] = await getDatabasePool().execute<FileRow[]>(
    `SELECT id, conversation_id, name, mime_type, size, content, created_at
      FROM lumy_files WHERE user_id = ? AND id IN (${placeholders})`,
    [userId, ...fileIds]
  )
  return rows
    .filter(
      (row) =>
        row.mime_type.startsWith("text/") ||
        ["application/json", "application/xml"].includes(row.mime_type)
    )
    .map((row) => ({
      name: row.name,
      content: row.content.toString("utf8").slice(0, 100_000),
    }))
}

export function toSessionFile(row: FileRow): SessionFile {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    name: row.name,
    size: Number(row.size),
    type: row.mime_type,
  }
}
