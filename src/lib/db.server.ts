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
  role: "user" | "admin"
  emailVerifiedAt: string | null
  disabledAt: string | null
}

type UserRow = RowDataPacket & {
  id: string
  email: string
  name: string
  password_hash: string
  created_at: Date
  role: "user" | "admin"
  email_verified_at: Date | null
  disabled_at: Date | null
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

type VerificationTokenRow = RowDataPacket & {
  id: string
  user_id: string
  email: string
  purpose: "verify_email" | "change_email"
  expires_at: Date
}

type AdminUserRow = RowDataPacket & {
  id: string
  email: string
  name: string
  role: "user" | "admin"
  email_verified_at: Date | null
  disabled_at: Date | null
  created_at: Date
  file_count: number
  feedback_count: number
  session_count: number
}

type FeedbackRow = RowDataPacket & {
  id: string
  user_id: string
  user_name: string
  user_email: string
  category: "idea" | "bug" | "other"
  message: string
  status: "new" | "reviewed" | "resolved"
  created_at: Date
  updated_at: Date
}

type AdminSessionRow = RowDataPacket & {
  id: string
  created_at: Date
  expires_at: Date
}

declare global {
  var __lumyDatabasePool: Pool | undefined
  var __lumyDatabaseSchemaReady: Promise<void> | undefined
}

function getDatabaseUrl() {
  return process.env.DATABASE_URL?.trim()
}

type DatabaseConfig = {
  host: string
  port: number
  user: string
  password: string
  database: string
}

const separateDatabaseKeys = [
  "DB_HOST",
  "DB_PORT",
  "DB_NAME",
  "DB_USER",
  "DB_PASSWORD",
] as const

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

function hasSeparateDatabaseEnvironment(env: NodeJS.ProcessEnv) {
  return separateDatabaseKeys.some((key) => env[key] !== undefined)
}

export function resolveDatabaseConfig(
  env: NodeJS.ProcessEnv = process.env
): DatabaseConfig {
  if (!hasSeparateDatabaseEnvironment(env)) {
    const rawUrl = env.DATABASE_URL?.trim()
    if (!rawUrl) {
      throw new Error(
        "La connexion MySQL n’est pas configurée. Renseignez DB_HOST, DB_NAME et DB_USER."
      )
    }
    return parseDatabaseUrl(rawUrl)
  }

  const host = env.DB_HOST?.trim()
  const database = env.DB_NAME?.trim()
  const user = env.DB_USER?.trim()
  const rawPort = env.DB_PORT?.trim() || "3306"
  const port = Number(rawPort)

  if (!host || !database || !user) {
    throw new Error(
      "DB_HOST, DB_NAME et DB_USER doivent être configurées ensemble."
    )
  }
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("DB_PORT doit être un numéro de port valide.")
  }

  return {
    host,
    port,
    user,
    password: env.DB_PASSWORD ?? "",
    database,
  }
}

export function isDatabaseConfigured() {
  return Boolean(
    getDatabaseUrl() || hasSeparateDatabaseEnvironment(process.env)
  )
}

export function getDatabasePool() {
  if (!globalThis.__lumyDatabasePool) {
    globalThis.__lumyDatabasePool = createPool({
      ...resolveDatabaseConfig(),
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

export async function closeDatabasePool() {
  const pool = globalThis.__lumyDatabasePool
  if (!pool) return
  globalThis.__lumyDatabasePool = undefined
  globalThis.__lumyDatabaseSchemaReady = undefined
  await pool.end()
}

const schemaStatements = [
  `CREATE TABLE IF NOT EXISTS lumy_users (
    id CHAR(36) NOT NULL PRIMARY KEY,
    email VARCHAR(191) NOT NULL UNIQUE,
    name VARCHAR(100) NOT NULL,
    password_hash VARCHAR(100) NOT NULL,
    role ENUM('user', 'admin') NOT NULL DEFAULT 'user',
    email_verified_at DATETIME(3) NULL,
    disabled_at DATETIME(3) NULL,
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
  `CREATE TABLE IF NOT EXISTS lumy_email_verification_tokens (
    id CHAR(36) NOT NULL PRIMARY KEY,
    user_id CHAR(36) NOT NULL,
    token_hash CHAR(64) NOT NULL UNIQUE,
    email VARCHAR(191) NOT NULL,
    purpose ENUM('verify_email', 'change_email') NOT NULL,
    expires_at DATETIME(3) NOT NULL,
    used_at DATETIME(3) NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX idx_lumy_verification_user (user_id),
    INDEX idx_lumy_verification_expiry (expires_at),
    CONSTRAINT fk_lumy_verification_user FOREIGN KEY (user_id)
      REFERENCES lumy_users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS lumy_feedback (
    id CHAR(36) NOT NULL PRIMARY KEY,
    user_id CHAR(36) NOT NULL,
    category ENUM('idea', 'bug', 'other') NOT NULL DEFAULT 'other',
    message TEXT NOT NULL,
    status ENUM('new', 'reviewed', 'resolved') NOT NULL DEFAULT 'new',
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
      ON UPDATE CURRENT_TIMESTAMP(3),
    INDEX idx_lumy_feedback_user (user_id),
    INDEX idx_lumy_feedback_status (status),
    CONSTRAINT fk_lumy_feedback_user FOREIGN KEY (user_id)
      REFERENCES lumy_users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
]

async function ensureUserColumn(name: string, definition: string) {
  const [rows] = await getDatabasePool().execute<RowDataPacket[]>(
    `SELECT 1 FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'lumy_users'
        AND COLUMN_NAME = ? LIMIT 1`,
    [name]
  )
  if (!rows.length) {
    await getDatabasePool().execute(
      `ALTER TABLE lumy_users ADD COLUMN ${name} ${definition}`
    )
  }
}

export function ensureDatabaseSchema() {
  if (!globalThis.__lumyDatabaseSchemaReady) {
    globalThis.__lumyDatabaseSchemaReady = (async () => {
      const pool = getDatabasePool()
      for (const statement of schemaStatements) await pool.execute(statement)
      await ensureUserColumn(
        "role",
        "ENUM('user', 'admin') NOT NULL DEFAULT 'user' AFTER password_hash"
      )
      await ensureUserColumn("email_verified_at", "DATETIME(3) NULL AFTER role")
      await ensureUserColumn(
        "disabled_at",
        "DATETIME(3) NULL AFTER email_verified_at"
      )
      await pool.execute(
        "DELETE FROM lumy_sessions WHERE expires_at <= CURRENT_TIMESTAMP(3)"
      )
      await pool.execute(
        "DELETE FROM lumy_email_verification_tokens WHERE expires_at <= CURRENT_TIMESTAMP(3) OR used_at IS NOT NULL"
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
    role: row.role,
    emailVerifiedAt: row.email_verified_at?.toISOString() ?? null,
    disabledAt: row.disabled_at?.toISOString() ?? null,
  }
}

export async function findUserByEmail(email: string) {
  await ensureDatabaseSchema()
  const [rows] = await getDatabasePool().execute<UserRow[]>(
    `SELECT id, email, name, password_hash, role, email_verified_at,
      disabled_at, created_at FROM lumy_users WHERE email = ? LIMIT 1`,
    [email]
  )
  const row = rows.at(0)
  return row ? mapUser(row) : null
}

export async function findUserBySessionHash(tokenHash: string) {
  await ensureDatabaseSchema()
  const [rows] = await getDatabasePool().execute<UserRow[]>(
    `SELECT u.id, u.email, u.name, u.password_hash, u.role,
        u.email_verified_at, u.disabled_at, u.created_at
      FROM lumy_sessions s
      INNER JOIN lumy_users u ON u.id = s.user_id
      WHERE s.token_hash = ? AND s.expires_at > CURRENT_TIMESTAMP(3)
        AND u.disabled_at IS NULL AND u.email_verified_at IS NOT NULL
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
  role?: "user" | "admin"
}) {
  await ensureDatabaseSchema()
  await getDatabasePool().execute(
    `INSERT INTO lumy_users (id, email, name, password_hash, role)
      VALUES (?, ?, ?, ?, ?)`,
    [user.id, user.email, user.name, user.passwordHash, user.role ?? "user"]
  )
}

export async function insertVerificationToken(input: {
  id: string
  userId: string
  tokenHash: string
  email: string
  purpose: "verify_email" | "change_email"
  expiresInSeconds: number
}) {
  await ensureDatabaseSchema()
  await withTransaction(async (connection) => {
    await connection.execute(
      `DELETE FROM lumy_email_verification_tokens
        WHERE user_id = ? AND purpose = ? AND used_at IS NULL`,
      [input.userId, input.purpose]
    )
    await connection.execute(
      `INSERT INTO lumy_email_verification_tokens
        (id, user_id, token_hash, email, purpose, expires_at)
        VALUES (?, ?, ?, ?, ?, TIMESTAMPADD(SECOND, ?, CURRENT_TIMESTAMP(3)))`,
      [
        input.id,
        input.userId,
        input.tokenHash,
        input.email,
        input.purpose,
        input.expiresInSeconds,
      ]
    )
  })
}

export async function insertSession(session: {
  id: string
  tokenHash: string
  userId: string
  expiresInSeconds: number
}) {
  await ensureDatabaseSchema()
  await getDatabasePool().execute(
    `INSERT INTO lumy_sessions (id, token_hash, user_id, expires_at)
      VALUES (?, ?, ?, TIMESTAMPADD(SECOND, ?, CURRENT_TIMESTAMP(3)))`,
    [session.id, session.tokenHash, session.userId, session.expiresInSeconds]
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
  passwordHash?: string
}) {
  await ensureDatabaseSchema()
  if (input.passwordHash) {
    await getDatabasePool().execute(
      "UPDATE lumy_users SET name = ?, password_hash = ? WHERE id = ?",
      [input.name, input.passwordHash, input.id]
    )
  } else {
    await getDatabasePool().execute(
      "UPDATE lumy_users SET name = ? WHERE id = ?",
      [input.name, input.id]
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

export async function consumeVerificationToken(tokenHash: string) {
  await ensureDatabaseSchema()
  return withTransaction(async (connection) => {
    const [rows] = await connection.execute<VerificationTokenRow[]>(
      `SELECT id, user_id, email, purpose, expires_at
        FROM lumy_email_verification_tokens
        WHERE token_hash = ? AND used_at IS NULL
          AND expires_at > CURRENT_TIMESTAMP(3)
        LIMIT 1 FOR UPDATE`,
      [tokenHash]
    )
    const token = rows.at(0)
    if (!token) return null

    if (token.purpose === "change_email") {
      await connection.execute(
        `UPDATE lumy_users SET email = ?, email_verified_at = CURRENT_TIMESTAMP(3)
          WHERE id = ?`,
        [token.email, token.user_id]
      )
    } else {
      await connection.execute(
        `UPDATE lumy_users SET email_verified_at = CURRENT_TIMESTAMP(3)
          WHERE id = ? AND email = ?`,
        [token.user_id, token.email]
      )
    }
    await connection.execute(
      `UPDATE lumy_email_verification_tokens
        SET used_at = CURRENT_TIMESTAMP(3) WHERE id = ?`,
      [token.id]
    )
    return {
      userId: token.user_id,
      email: token.email,
      purpose: token.purpose,
    }
  })
}

export async function deleteUnverifiedUser(userId: string) {
  await ensureDatabaseSchema()
  await getDatabasePool().execute(
    "DELETE FROM lumy_users WHERE id = ? AND email_verified_at IS NULL",
    [userId]
  )
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

export async function listAdminUsers() {
  await ensureDatabaseSchema()
  const [rows] = await getDatabasePool().execute<AdminUserRow[]>(
    `SELECT u.id, u.email, u.name, u.role, u.email_verified_at,
        u.disabled_at, u.created_at,
        (SELECT COUNT(*) FROM lumy_files f WHERE f.user_id = u.id) AS file_count,
        (SELECT COUNT(*) FROM lumy_feedback fb WHERE fb.user_id = u.id) AS feedback_count,
        (SELECT COUNT(*) FROM lumy_sessions s WHERE s.user_id = u.id
          AND s.expires_at > CURRENT_TIMESTAMP(3)) AS session_count
      FROM lumy_users u ORDER BY u.created_at DESC`
  )
  return rows.map((row) => ({
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    emailVerified: Boolean(row.email_verified_at),
    disabled: Boolean(row.disabled_at),
    createdAt: row.created_at.toISOString(),
    fileCount: Number(row.file_count),
    feedbackCount: Number(row.feedback_count),
    sessionCount: Number(row.session_count),
  }))
}

export async function listAdminNotificationRecipients() {
  await ensureDatabaseSchema()
  const [rows] = await getDatabasePool().execute<
    Array<RowDataPacket & { id: string; email: string; name: string }>
  >(
    `SELECT id, email, name FROM lumy_users
      WHERE role = 'admin' AND email_verified_at IS NOT NULL
        AND disabled_at IS NULL ORDER BY created_at ASC`
  )
  return rows.map((row) => ({ id: row.id, email: row.email, name: row.name }))
}

export async function listSessionsForAdmin(userId: string) {
  await ensureDatabaseSchema()
  const [rows] = await getDatabasePool().execute<AdminSessionRow[]>(
    `SELECT id, created_at, expires_at FROM lumy_sessions
      WHERE user_id = ? AND expires_at > CURRENT_TIMESTAMP(3)
      ORDER BY created_at DESC`,
    [userId]
  )
  return rows.map((row) => ({
    id: row.id,
    createdAt: row.created_at.toISOString(),
    expiresAt: row.expires_at.toISOString(),
  }))
}

export async function deleteSessionForAdmin(sessionId: string) {
  await ensureDatabaseSchema()
  const [result] = await getDatabasePool().execute<ResultSetHeader>(
    "DELETE FROM lumy_sessions WHERE id = ?",
    [sessionId]
  )
  return result.affectedRows > 0
}

export async function setAdminUserRole(userId: string, role: "user" | "admin") {
  await ensureDatabaseSchema()
  await getDatabasePool().execute(
    "UPDATE lumy_users SET role = ? WHERE id = ?",
    [role, userId]
  )
}

export async function setAdminUserDisabled(userId: string, disabled: boolean) {
  await ensureDatabaseSchema()
  await withTransaction(async (connection) => {
    await connection.execute(
      `UPDATE lumy_users SET disabled_at = ${disabled ? "CURRENT_TIMESTAMP(3)" : "NULL"}
        WHERE id = ?`,
      [userId]
    )
    if (disabled) {
      await connection.execute("DELETE FROM lumy_sessions WHERE user_id = ?", [
        userId,
      ])
    }
  })
}

export async function countAdmins() {
  await ensureDatabaseSchema()
  const [rows] = await getDatabasePool().execute<
    Array<RowDataPacket & { count: number }>
  >("SELECT COUNT(*) AS count FROM lumy_users WHERE role = 'admin'")
  return Number(rows.at(0)?.count ?? 0)
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

export async function getChatFileContext(userId: string, fileIds: string[]) {
  if (fileIds.length === 0) return { documents: [], images: [] }
  await ensureDatabaseSchema()
  const placeholders = fileIds.map(() => "?").join(",")
  const [rows] = await getDatabasePool().execute<FileRow[]>(
    `SELECT id, conversation_id, name, mime_type, size, content, created_at
      FROM lumy_files WHERE user_id = ? AND id IN (${placeholders})`,
    [userId, ...fileIds]
  )
  const documents = rows
    .filter((row) =>
      row.mime_type.startsWith("text/") ||
      ["application/json", "application/xml"].includes(row.mime_type)
    )
    .map((row) => ({
      name: row.name,
      content: row.content.toString("utf8").slice(0, 100_000),
    }))
  const images = rows
    .filter((row) => row.mime_type.startsWith("image/"))
    .map((row) => ({
      name: row.name,
      type: row.mime_type,
      content: row.content,
    }))
  return { documents, images }
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

export async function listFilesForAdmin(userId: string) {
  await ensureDatabaseSchema()
  const [rows] = await getDatabasePool().execute<FileRow[]>(
    `SELECT id, conversation_id, name, mime_type, size, content, created_at
      FROM lumy_files WHERE user_id = ? ORDER BY created_at DESC`,
    [userId]
  )
  return rows.map((row) => ({
    ...toSessionFile(row),
    createdAt: row.created_at.toISOString(),
  }))
}

export async function findFileForAdmin(fileId: string) {
  await ensureDatabaseSchema()
  const [rows] = await getDatabasePool().execute<FileRow[]>(
    `SELECT id, conversation_id, name, mime_type, size, content, created_at
      FROM lumy_files WHERE id = ? LIMIT 1`,
    [fileId]
  )
  return rows.at(0) ?? null
}

export async function deleteFileForAdmin(fileId: string) {
  await ensureDatabaseSchema()
  const [result] = await getDatabasePool().execute<ResultSetHeader>(
    "DELETE FROM lumy_files WHERE id = ?",
    [fileId]
  )
  return result.affectedRows > 0
}

export async function deleteFilesForConversation(
  userId: string,
  conversationId: string
) {
  await ensureDatabaseSchema()
  await getDatabasePool().execute(
    "DELETE FROM lumy_files WHERE user_id = ? AND conversation_id = ?",
    [userId, conversationId]
  )
}

export async function insertFeedback(input: {
  id: string
  userId: string
  category: "idea" | "bug" | "other"
  message: string
}) {
  await ensureDatabaseSchema()
  await getDatabasePool().execute(
    `INSERT INTO lumy_feedback (id, user_id, category, message)
      VALUES (?, ?, ?, ?)`,
    [input.id, input.userId, input.category, input.message]
  )
}

export async function listFeedbackForAdmin() {
  await ensureDatabaseSchema()
  const [rows] = await getDatabasePool().execute<FeedbackRow[]>(
    `SELECT f.id, f.user_id, u.name AS user_name, u.email AS user_email,
        f.category, f.message, f.status, f.created_at, f.updated_at
      FROM lumy_feedback f
      INNER JOIN lumy_users u ON u.id = f.user_id
      ORDER BY FIELD(f.status, 'new', 'reviewed', 'resolved'), f.created_at DESC`
  )
  return rows.map((row) => ({
    id: row.id,
    userId: row.user_id,
    userName: row.user_name,
    userEmail: row.user_email,
    category: row.category,
    message: row.message,
    status: row.status,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  }))
}

export async function updateFeedbackStatus(
  feedbackId: string,
  status: "new" | "reviewed" | "resolved"
) {
  await ensureDatabaseSchema()
  const [result] = await getDatabasePool().execute<ResultSetHeader>(
    "UPDATE lumy_feedback SET status = ? WHERE id = ?",
    [status, feedbackId]
  )
  return result.affectedRows > 0
}

export async function deleteFeedbackForAdmin(feedbackId: string) {
  await ensureDatabaseSchema()
  const [result] = await getDatabasePool().execute<ResultSetHeader>(
    "DELETE FROM lumy_feedback WHERE id = ?",
    [feedbackId]
  )
  return result.affectedRows > 0
}
