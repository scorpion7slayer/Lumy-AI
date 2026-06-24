import { createHash, randomUUID } from "node:crypto"
import { createPool } from "mysql2/promise"
import type {
  Pool,
  PoolConnection,
  ResultSetHeader,
  RowDataPacket,
} from "mysql2/promise"
import { isChatDocumentFile } from "@/lib/file-support"
import type { PersistedChatState, SessionFile } from "@/lib/chat-types"
import type { EarlyAccessStatus } from "@/lib/auth-types"

export type DatabaseRole = "user" | "admin" | "super_admin"

const MODEL_AUTO_DISABLE_INCIDENT_THRESHOLD = 5

export type DatabaseUser = {
  id: string
  email: string
  name: string
  passwordHash: string
  createdAt: string
  role: DatabaseRole
  accessStatus: EarlyAccessStatus
  accessRequestedAt: string | null
  accessReviewedAt: string | null
  accessNotificationSentAt: string | null
  emailVerifiedAt: string | null
  disabledAt: string | null
}

type UserRow = RowDataPacket & {
  id: string
  email: string
  name: string
  password_hash: string
  created_at: Date
  role: DatabaseRole
  access_status: EarlyAccessStatus
  access_requested_at: Date | null
  access_reviewed_at: Date | null
  access_notification_sent_at: Date | null
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
  role: DatabaseRole
  access_status: EarlyAccessStatus
  access_requested_at: Date | null
  access_reviewed_at: Date | null
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

type IncidentRow = RowDataPacket & {
  id: string
  request_id: string | null
  user_id: string | null
  requested_provider: string | null
  requested_model: string | null
  provider: string
  model: string
  http_status: number
  failure_kind: string
  sanitized_detail: string
  surfaced_to_user: number
  occurrence_count: number
  first_occurred_at: Date
  last_occurred_at: Date
  resolved_at: Date | null
  resolved_by_user_id: string | null
}

export type SuperAdminIntegrityRepair = {
  incidentId: string
  email: string
  previousRole: DatabaseRole
  repairedRole: DatabaseRole
  reason: string
}

declare global {
  var __lumyDatabasePool: Pool | undefined
  var __lumyDatabaseSchemaReady: Promise<void> | undefined
}

function getDatabaseUrl() {
  return process.env.DATABASE_URL?.trim()
}

export function superAdminEmail() {
  return (
    process.env.SUPER_ADMIN_EMAIL?.trim().toLowerCase() ||
    "theodarville@gmail.com"
  )
}

function timeZoneOffsetMilliseconds(instant: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant)
  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)])
  )
  const representedAsUtc = Date.UTC(
    values.year,
    values.month - 1,
    values.day,
    values.hour,
    values.minute,
    values.second
  )
  const instantToSecond = Math.trunc(instant.getTime() / 1000) * 1000
  return representedAsUtc - instantToSecond
}

/**
 * MySQL renvoie ici un DATETIME local sous la forme d'une Date UTC. Cette
 * fonction réinterprète ses composantes UTC comme une heure murale dans le
 * fuseau de l'application, sans appliquer un décalage été/hiver fixe.
 */
export function databaseDateToISOString(
  date: Date,
  timeZone = process.env.APP_TIME_ZONE?.trim() || "Europe/Brussels"
) {
  const wallClockMilliseconds = Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
    date.getUTCHours(),
    date.getUTCMinutes(),
    date.getUTCSeconds(),
    date.getUTCMilliseconds()
  )
  let instantMilliseconds = wallClockMilliseconds
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const offset = timeZoneOffsetMilliseconds(
      new Date(instantMilliseconds),
      timeZone
    )
    const adjusted = wallClockMilliseconds - offset
    if (adjusted === instantMilliseconds) break
    instantMilliseconds = adjusted
  }
  return new Date(instantMilliseconds).toISOString()
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
  `CREATE TABLE IF NOT EXISTS lumy_schema_migrations (
    name VARCHAR(191) NOT NULL PRIMARY KEY,
    applied_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS lumy_users (
    id CHAR(36) NOT NULL PRIMARY KEY,
    email VARCHAR(191) NOT NULL UNIQUE,
    name VARCHAR(100) NOT NULL,
    password_hash VARCHAR(100) NOT NULL,
    role ENUM('user', 'admin', 'super_admin') NOT NULL DEFAULT 'user',
    access_status ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
    access_requested_at DATETIME(3) NULL,
    access_reviewed_at DATETIME(3) NULL,
    access_reviewed_by CHAR(36) NULL,
    access_notification_sent_at DATETIME(3) NULL,
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
  `CREATE TABLE IF NOT EXISTS lumy_model_incidents (
    id CHAR(36) NOT NULL PRIMARY KEY,
    fingerprint CHAR(64) NOT NULL,
    request_id VARCHAR(100) NULL,
    user_id CHAR(36) NULL,
    requested_provider VARCHAR(100) NULL,
    requested_model VARCHAR(250) NULL,
    provider VARCHAR(100) NOT NULL,
    model VARCHAR(250) NOT NULL,
    http_status SMALLINT UNSIGNED NOT NULL,
    failure_kind VARCHAR(100) NOT NULL,
    sanitized_detail VARCHAR(1000) NOT NULL,
    surfaced_to_user BOOLEAN NOT NULL DEFAULT FALSE,
    occurrence_count INT UNSIGNED NOT NULL DEFAULT 1,
    first_occurred_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    last_occurred_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    resolved_at DATETIME(3) NULL,
    resolved_by_user_id CHAR(36) NULL,
    INDEX idx_lumy_incidents_open (resolved_at, last_occurred_at),
    INDEX idx_lumy_incidents_fingerprint (fingerprint, resolved_at),
    INDEX idx_lumy_incidents_provider_model (provider, model),
    CONSTRAINT fk_lumy_incidents_user FOREIGN KEY (user_id)
      REFERENCES lumy_users(id) ON DELETE SET NULL,
    CONSTRAINT fk_lumy_incidents_resolver FOREIGN KEY (resolved_by_user_id)
      REFERENCES lumy_users(id) ON DELETE SET NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS lumy_model_controls (
    provider VARCHAR(100) NOT NULL,
    model_id VARCHAR(250) NULL,
    model_scope_key VARCHAR(250) NOT NULL DEFAULT '',
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    updated_by_user_id CHAR(36) NULL,
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
      ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (provider, model_scope_key),
    INDEX idx_lumy_model_controls_enabled (enabled, provider),
    CONSTRAINT fk_lumy_model_controls_updater FOREIGN KEY (updated_by_user_id)
      REFERENCES lumy_users(id) ON DELETE SET NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS lumy_security_events (
    id CHAR(36) NOT NULL PRIMARY KEY,
    event_type VARCHAR(100) NOT NULL,
    user_id CHAR(36) NULL,
    email VARCHAR(191) NOT NULL,
    previous_role VARCHAR(32) NOT NULL,
    repaired_role VARCHAR(32) NOT NULL,
    reason VARCHAR(500) NOT NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX idx_lumy_security_events_created (created_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS lumy_rate_limit_buckets (
    scope_hash CHAR(64) NOT NULL PRIMARY KEY,
    hit_count INT UNSIGNED NOT NULL DEFAULT 1,
    window_started_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
      ON UPDATE CURRENT_TIMESTAMP(3),
    INDEX idx_lumy_rate_limits_updated (updated_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS lumy_notifications (
    id CHAR(36) NOT NULL PRIMARY KEY,
    user_id CHAR(36) NOT NULL,
    type VARCHAR(50) NOT NULL,
    title VARCHAR(160) NOT NULL,
    body VARCHAR(1000) NOT NULL,
    target_url VARCHAR(500) NULL,
    read_at DATETIME(3) NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX idx_lumy_notifications_user_unread (user_id, read_at, created_at),
    CONSTRAINT fk_lumy_notifications_user FOREIGN KEY (user_id)
      REFERENCES lumy_users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS lumy_announcements (
    id CHAR(36) NOT NULL PRIMARY KEY,
    title VARCHAR(160) NOT NULL,
    body TEXT NOT NULL,
    kind ENUM('welcome', 'changelog', 'maintenance', 'general') NOT NULL DEFAULT 'general',
    published_at DATETIME(3) NULL,
    created_by CHAR(36) NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
      ON UPDATE CURRENT_TIMESTAMP(3),
    INDEX idx_lumy_announcements_published (published_at),
    CONSTRAINT fk_lumy_announcements_creator FOREIGN KEY (created_by)
      REFERENCES lumy_users(id) ON DELETE SET NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS lumy_conversation_references (
    id CHAR(36) NOT NULL PRIMARY KEY,
    user_id CHAR(36) NOT NULL,
    conversation_id VARCHAR(64) NOT NULL,
    referenced_conversation_id VARCHAR(64) NOT NULL,
    referenced_title VARCHAR(255) NOT NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    UNIQUE KEY uq_lumy_conversation_reference
      (user_id, conversation_id, referenced_conversation_id),
    INDEX idx_lumy_conversation_references_source (user_id, conversation_id),
    CONSTRAINT fk_lumy_conversation_references_user FOREIGN KEY (user_id)
      REFERENCES lumy_users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS lumy_group_chats (
    id CHAR(36) NOT NULL PRIMARY KEY,
    title VARCHAR(160) NOT NULL,
    owner_user_id CHAR(36) NOT NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
      ON UPDATE CURRENT_TIMESTAMP(3),
    INDEX idx_lumy_group_chats_owner (owner_user_id),
    CONSTRAINT fk_lumy_group_chats_owner FOREIGN KEY (owner_user_id)
      REFERENCES lumy_users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS lumy_group_members (
    group_id CHAR(36) NOT NULL,
    user_id CHAR(36) NOT NULL,
    role ENUM('owner', 'member') NOT NULL DEFAULT 'member',
    joined_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (group_id, user_id),
    INDEX idx_lumy_group_members_user (user_id, joined_at),
    CONSTRAINT fk_lumy_group_members_group FOREIGN KEY (group_id)
      REFERENCES lumy_group_chats(id) ON DELETE CASCADE,
    CONSTRAINT fk_lumy_group_members_user FOREIGN KEY (user_id)
      REFERENCES lumy_users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS lumy_group_invitations (
    id CHAR(36) NOT NULL PRIMARY KEY,
    group_id CHAR(36) NOT NULL,
    invited_email VARCHAR(191) NOT NULL,
    invited_user_id CHAR(36) NULL,
    invited_by_user_id CHAR(36) NOT NULL,
    token_hash CHAR(64) NOT NULL UNIQUE,
    status ENUM('pending', 'accepted', 'declined', 'expired') NOT NULL DEFAULT 'pending',
    expires_at DATETIME(3) NOT NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    responded_at DATETIME(3) NULL,
    INDEX idx_lumy_group_invitations_email (invited_email, status, expires_at),
    CONSTRAINT fk_lumy_group_invitations_group FOREIGN KEY (group_id)
      REFERENCES lumy_group_chats(id) ON DELETE CASCADE,
    CONSTRAINT fk_lumy_group_invitations_user FOREIGN KEY (invited_user_id)
      REFERENCES lumy_users(id) ON DELETE SET NULL,
    CONSTRAINT fk_lumy_group_invitations_inviter FOREIGN KEY (invited_by_user_id)
      REFERENCES lumy_users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS lumy_group_messages (
    id CHAR(36) NOT NULL PRIMARY KEY,
    group_id CHAR(36) NOT NULL,
    author_user_id CHAR(36) NOT NULL,
    content TEXT NOT NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX idx_lumy_group_messages_group (group_id, created_at),
    CONSTRAINT fk_lumy_group_messages_group FOREIGN KEY (group_id)
      REFERENCES lumy_group_chats(id) ON DELETE CASCADE,
    CONSTRAINT fk_lumy_group_messages_author FOREIGN KEY (author_user_id)
      REFERENCES lumy_users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS lumy_support_ticket_cooldowns (
    user_id CHAR(36) NOT NULL PRIMARY KEY,
    last_created_at DATETIME(3) NULL,
    CONSTRAINT fk_lumy_support_cooldown_user FOREIGN KEY (user_id)
      REFERENCES lumy_users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS lumy_support_tickets (
    id CHAR(36) NOT NULL PRIMARY KEY,
    requester_user_id CHAR(36) NOT NULL,
    subject VARCHAR(160) NOT NULL,
    status ENUM('open', 'in_progress', 'closed') NOT NULL DEFAULT 'open',
    assigned_admin_id CHAR(36) NULL,
    pending_handoff_admin_id CHAR(36) NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
      ON UPDATE CURRENT_TIMESTAMP(3),
    closed_at DATETIME(3) NULL,
    INDEX idx_lumy_support_requester_status (requester_user_id, status, created_at),
    INDEX idx_lumy_support_admin_status (assigned_admin_id, status, updated_at),
    CONSTRAINT fk_lumy_support_requester FOREIGN KEY (requester_user_id)
      REFERENCES lumy_users(id) ON DELETE CASCADE,
    CONSTRAINT fk_lumy_support_assignee FOREIGN KEY (assigned_admin_id)
      REFERENCES lumy_users(id) ON DELETE SET NULL,
    CONSTRAINT fk_lumy_support_handoff FOREIGN KEY (pending_handoff_admin_id)
      REFERENCES lumy_users(id) ON DELETE SET NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS lumy_support_messages (
    id CHAR(36) NOT NULL PRIMARY KEY,
    ticket_id CHAR(36) NOT NULL,
    author_user_id CHAR(36) NOT NULL,
    content TEXT NOT NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX idx_lumy_support_messages_ticket (ticket_id, created_at),
    CONSTRAINT fk_lumy_support_messages_ticket FOREIGN KEY (ticket_id)
      REFERENCES lumy_support_tickets(id) ON DELETE CASCADE,
    CONSTRAINT fk_lumy_support_messages_author FOREIGN KEY (author_user_id)
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

async function ensureUserRoleDefinition() {
  const [rows] = await getDatabasePool().execute<
    Array<RowDataPacket & { column_type: string }>
  >(
    `SELECT COLUMN_TYPE AS column_type FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'lumy_users'
        AND COLUMN_NAME = 'role' LIMIT 1`
  )
  if (!rows.at(0)?.column_type.includes("super_admin")) {
    await getDatabasePool().execute(
      `ALTER TABLE lumy_users
        MODIFY COLUMN role ENUM('user', 'admin', 'super_admin')
        NOT NULL DEFAULT 'user'`
    )
  }
}

async function applyEarlyAccessRoleMigration() {
  const migrationName = "2026-06-22-early-access-super-admin"
  await withTransaction(async (connection) => {
    const [rows] = await connection.execute<RowDataPacket[]>(
      "SELECT 1 FROM lumy_schema_migrations WHERE name = ? LIMIT 1 FOR UPDATE",
      [migrationName]
    )
    if (rows.length) return
    await connection.execute(
      `UPDATE lumy_users SET access_status = 'pending',
        access_requested_at = COALESCE(access_requested_at, CURRENT_TIMESTAMP(3)),
        access_reviewed_at = NULL, access_reviewed_by = NULL
        WHERE role = 'user'`
    )
    await connection.execute(
      `UPDATE lumy_users SET access_status = 'approved'
        WHERE role IN ('admin', 'super_admin')`
    )
    await connection.execute(
      `UPDATE lumy_users SET role = 'super_admin', access_status = 'approved'
        WHERE LOWER(email) = ?`,
      [superAdminEmail()]
    )
    await connection.execute(
      "INSERT INTO lumy_schema_migrations (name) VALUES (?)",
      [migrationName]
    )
  })
}

export function ensureDatabaseSchema() {
  if (!globalThis.__lumyDatabaseSchemaReady) {
    globalThis.__lumyDatabaseSchemaReady = (async () => {
      const pool = getDatabasePool()
      for (const statement of schemaStatements) await pool.execute(statement)
      await ensureUserRoleDefinition()
      await ensureUserColumn(
        "role",
        "ENUM('user', 'admin', 'super_admin') NOT NULL DEFAULT 'user' AFTER password_hash"
      )
      await ensureUserColumn(
        "access_status",
        "ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending' AFTER role"
      )
      await ensureUserColumn(
        "access_requested_at",
        "DATETIME(3) NULL AFTER access_status"
      )
      await ensureUserColumn(
        "access_reviewed_at",
        "DATETIME(3) NULL AFTER access_requested_at"
      )
      await ensureUserColumn(
        "access_reviewed_by",
        "CHAR(36) NULL AFTER access_reviewed_at"
      )
      await ensureUserColumn(
        "access_notification_sent_at",
        "DATETIME(3) NULL AFTER access_reviewed_by"
      )
      await ensureUserColumn("email_verified_at", "DATETIME(3) NULL AFTER role")
      await ensureUserColumn(
        "disabled_at",
        "DATETIME(3) NULL AFTER email_verified_at"
      )
      await applyEarlyAccessRoleMigration()
      await pool.execute(
        `INSERT IGNORE INTO lumy_announcements
          (id, title, body, kind, published_at)
          VALUES ('00000000-0000-4000-8000-000000000001',
            'Bienvenue dans l’accès anticipé de Lumy AI',
            'Merci de participer à l’accès anticipé. Lumy évolue rapidement : consultez cet espace pour suivre les nouveautés, maintenances et changements importants.',
            'welcome', CURRENT_TIMESTAMP(3))`
      )
      await pool.execute(
        "DELETE FROM lumy_sessions WHERE expires_at <= CURRENT_TIMESTAMP(3)"
      )
      await pool.execute(
        "DELETE FROM lumy_email_verification_tokens WHERE expires_at <= CURRENT_TIMESTAMP(3) OR used_at IS NOT NULL"
      )
      await pool.execute(
        "DELETE FROM lumy_rate_limit_buckets WHERE updated_at < TIMESTAMPADD(DAY, -2, CURRENT_TIMESTAMP(3))"
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
    createdAt: databaseDateToISOString(row.created_at),
    role: row.role,
    accessStatus: row.access_status,
    accessRequestedAt: row.access_requested_at
      ? databaseDateToISOString(row.access_requested_at)
      : null,
    accessReviewedAt: row.access_reviewed_at
      ? databaseDateToISOString(row.access_reviewed_at)
      : null,
    accessNotificationSentAt: row.access_notification_sent_at
      ? databaseDateToISOString(row.access_notification_sent_at)
      : null,
    emailVerifiedAt: row.email_verified_at
      ? databaseDateToISOString(row.email_verified_at)
      : null,
    disabledAt: row.disabled_at
      ? databaseDateToISOString(row.disabled_at)
      : null,
  }
}

export async function findUserByEmail(email: string) {
  await ensureDatabaseSchema()
  const [rows] = await getDatabasePool().execute<UserRow[]>(
    `SELECT id, email, name, password_hash, role, access_status,
      access_requested_at, access_reviewed_at, access_notification_sent_at,
      email_verified_at, disabled_at, created_at
      FROM lumy_users WHERE email = ? LIMIT 1`,
    [email]
  )
  const row = rows.at(0)
  return row ? mapUser(row) : null
}

export async function findUserBySessionHash(tokenHash: string) {
  await ensureDatabaseSchema()
  const [rows] = await getDatabasePool().execute<UserRow[]>(
    `SELECT u.id, u.email, u.name, u.password_hash, u.role, u.access_status,
        u.access_requested_at, u.access_reviewed_at,
        u.access_notification_sent_at,
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
  role?: DatabaseRole
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
    `SELECT u.id, u.email, u.name, u.role, u.access_status,
        u.access_requested_at, u.access_reviewed_at, u.email_verified_at,
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
    role: row.role === "super_admin" ? ("admin" as const) : row.role,
    internalRole: row.role,
    accessStatus: row.access_status,
    accessRequestedAt: row.access_requested_at
      ? databaseDateToISOString(row.access_requested_at)
      : null,
    accessReviewedAt: row.access_reviewed_at
      ? databaseDateToISOString(row.access_reviewed_at)
      : null,
    emailVerified: Boolean(row.email_verified_at),
    disabled: Boolean(row.disabled_at),
    createdAt: databaseDateToISOString(row.created_at),
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
      WHERE role = 'super_admin' AND email_verified_at IS NOT NULL
        AND disabled_at IS NULL ORDER BY created_at ASC`
  )
  return rows.map((row) => ({ id: row.id, email: row.email, name: row.name }))
}

export async function listSupportAdminRecipients() {
  await ensureDatabaseSchema()
  const [rows] = await getDatabasePool().execute<
    Array<RowDataPacket & { id: string; email: string; name: string }>
  >(
    `SELECT id, email, name FROM lumy_users
      WHERE role IN ('admin', 'super_admin') AND email_verified_at IS NOT NULL
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
    createdAt: databaseDateToISOString(row.created_at),
    expiresAt: databaseDateToISOString(row.expires_at),
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
    `UPDATE lumy_users SET role = ?,
      access_status = IF(? = 'admin', 'approved', access_status)
      WHERE id = ? AND role <> 'super_admin'`,
    [role, role, userId]
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
  >(
    "SELECT COUNT(*) AS count FROM lumy_users WHERE role IN ('admin', 'super_admin')"
  )
  return Number(rows.at(0)?.count ?? 0)
}

export async function getEarlyAccessStatus(userId: string) {
  await ensureDatabaseSchema()
  const [rows] = await getDatabasePool().execute<
    Array<
      RowDataPacket & {
        role: DatabaseRole
        access_status: EarlyAccessStatus
        access_requested_at: Date | null
        access_reviewed_at: Date | null
        access_notification_sent_at: Date | null
      }
    >
  >(
    `SELECT role, access_status, access_requested_at, access_reviewed_at,
      access_notification_sent_at FROM lumy_users WHERE id = ? LIMIT 1`,
    [userId]
  )
  const row = rows.at(0)
  if (!row) return null
  const status =
    row.role === "admin" || row.role === "super_admin"
      ? ("approved" as const)
      : row.access_status
  return {
    status,
    requestedAt: row.access_requested_at
      ? databaseDateToISOString(row.access_requested_at)
      : null,
    reviewedAt: row.access_reviewed_at
      ? databaseDateToISOString(row.access_reviewed_at)
      : null,
    notificationSentAt: row.access_notification_sent_at
      ? databaseDateToISOString(row.access_notification_sent_at)
      : null,
    canAccess: status === "approved",
  }
}

export async function requestEarlyAccess(userId: string) {
  await ensureDatabaseSchema()
  await getDatabasePool().execute(
    `UPDATE lumy_users SET
      access_requested_at = COALESCE(access_requested_at, CURRENT_TIMESTAMP(3)),
      access_reviewed_at = IF(access_status = 'rejected', NULL, access_reviewed_at),
      access_reviewed_by = IF(access_status = 'rejected', NULL, access_reviewed_by),
      access_notification_sent_at = IF(access_status = 'rejected', NULL, access_notification_sent_at),
      access_status = IF(role IN ('admin', 'super_admin'), 'approved', 'pending')
      WHERE id = ?`,
    [userId]
  )
  return getEarlyAccessStatus(userId)
}

export async function markEarlyAccessNotificationSent(userId: string) {
  await ensureDatabaseSchema()
  const [result] = await getDatabasePool().execute<ResultSetHeader>(
    `UPDATE lumy_users SET access_notification_sent_at = CURRENT_TIMESTAMP(3)
      WHERE id = ? AND access_notification_sent_at IS NULL`,
    [userId]
  )
  return result.affectedRows > 0
}

export async function reviewEarlyAccess(
  userId: string,
  status: "approved" | "rejected",
  reviewedByUserId: string
) {
  await ensureDatabaseSchema()
  return withTransaction(async (connection) => {
    const [result] = await connection.execute<ResultSetHeader>(
      `UPDATE lumy_users SET access_status = ?,
        access_reviewed_at = CURRENT_TIMESTAMP(3), access_reviewed_by = ?
        WHERE id = ? AND role = 'user'`,
      [status, reviewedByUserId, userId]
    )
    if (!result.affectedRows) return false
    await connection.execute(
      `INSERT INTO lumy_notifications
        (id, user_id, type, title, body, target_url)
        VALUES (?, ?, 'early_access', ?, ?, '/')`,
      [
        randomUUID(),
        userId,
        status === "approved"
          ? "Accès anticipé accepté"
          : "Demande d’accès mise à jour",
        status === "approved"
          ? "Votre compte peut maintenant accéder à Lumy AI."
          : "Votre demande d’accès anticipé n’a pas été acceptée pour le moment.",
      ]
    )
    return true
  })
}

export async function repairSuperAdminIntegrity() {
  await ensureDatabaseSchema()
  const ownerEmail = superAdminEmail()
  return withTransaction(async (connection) => {
    const [rows] = await connection.execute<UserRow[]>(
      `SELECT id, email, name, password_hash, role, access_status,
        access_requested_at, access_reviewed_at, access_notification_sent_at,
        email_verified_at, disabled_at, created_at FROM lumy_users
        WHERE role = 'super_admin' OR LOWER(email) = ? FOR UPDATE`,
      [ownerEmail]
    )
    const repairs: SuperAdminIntegrityRepair[] = []
    for (const row of rows) {
      const isOwner = row.email.toLowerCase() === ownerEmail
      const repairedRole: DatabaseRole = isOwner ? "super_admin" : "user"
      if (row.role === repairedRole && row.access_status === "approved")
        continue
      await connection.execute(
        "UPDATE lumy_users SET role = ?, access_status = 'approved' WHERE id = ?",
        [repairedRole, row.id]
      )
      const incidentId = randomUUID()
      const reason = isOwner
        ? "Le rôle du propriétaire configuré a été restauré."
        : "Un rôle super administrateur non autorisé a été rétrogradé."
      await connection.execute(
        `INSERT INTO lumy_security_events
          (id, event_type, user_id, email, previous_role, repaired_role, reason)
          VALUES (?, 'super_admin_integrity_repair', ?, ?, ?, ?, ?)`,
        [incidentId, row.id, row.email, row.role, repairedRole, reason]
      )
      repairs.push({
        incidentId,
        email: row.email,
        previousRole: row.role,
        repairedRole,
        reason,
      })
    }
    return repairs
  })
}

export async function insertModelIncident(input: {
  id?: string
  requestId?: string | null
  userId: string
  requestedProvider: string
  requestedModel: string
  provider: string
  model: string
  httpStatus: number
  failureKind: string
  sanitizedDetail: string
  surfacedToUser: boolean
}) {
  await ensureDatabaseSchema()
  const normalized = {
    requestId: input.requestId?.slice(0, 100) || null,
    requestedProvider: input.requestedProvider.slice(0, 100),
    requestedModel: input.requestedModel.slice(0, 250),
    provider: input.provider.slice(0, 100),
    model: input.model.slice(0, 250),
    httpStatus: Math.max(0, Math.min(65_535, Math.trunc(input.httpStatus))),
    failureKind: input.failureKind.slice(0, 100),
    sanitizedDetail: input.sanitizedDetail.slice(0, 1_000),
  }
  const fingerprint = createHash("sha256")
    .update(
      [
        normalized.requestedProvider,
        normalized.requestedModel,
        normalized.provider,
        normalized.model,
        normalized.httpStatus,
        normalized.failureKind,
        normalized.sanitizedDetail,
      ].join("\u0000")
    )
    .digest("hex")
  return withTransaction(async (connection) => {
    const [existingRows] = await connection.execute<
      Array<RowDataPacket & { id: string }>
    >(
      `SELECT id FROM lumy_model_incidents
        WHERE fingerprint = ? AND resolved_at IS NULL
        ORDER BY last_occurred_at DESC LIMIT 1 FOR UPDATE`,
      [fingerprint]
    )
    const existing = existingRows.at(0)
    let incidentId: string
    if (existing) {
      await connection.execute(
        `UPDATE lumy_model_incidents SET request_id = ?, user_id = ?,
          surfaced_to_user = surfaced_to_user OR ?,
          occurrence_count = occurrence_count + 1,
          last_occurred_at = CURRENT_TIMESTAMP(3) WHERE id = ?`,
        [normalized.requestId, input.userId, input.surfacedToUser, existing.id]
      )
      incidentId = existing.id
    } else {
      const id = input.id ?? randomUUID()
      await connection.execute(
        `INSERT INTO lumy_model_incidents
          (id, fingerprint, request_id, user_id, requested_provider,
            requested_model, provider, model, http_status, failure_kind,
            sanitized_detail, surfaced_to_user)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          fingerprint,
          normalized.requestId,
          input.userId,
          normalized.requestedProvider,
          normalized.requestedModel,
          normalized.provider,
          normalized.model,
          normalized.httpStatus,
          normalized.failureKind,
          normalized.sanitizedDetail,
          input.surfacedToUser,
        ]
      )
      incidentId = id
    }
    const [countRows] = await connection.execute<
      Array<RowDataPacket & { occurrence_count: number }>
    >(
      `SELECT COALESCE(SUM(occurrence_count), 0) AS occurrence_count
        FROM lumy_model_incidents
        WHERE provider = ? AND model = ? AND resolved_at IS NULL`,
      [normalized.provider, normalized.model]
    )
    const occurrenceCount = Number(countRows.at(0)?.occurrence_count ?? 0)
    if (occurrenceCount > MODEL_AUTO_DISABLE_INCIDENT_THRESHOLD) {
      await connection.execute(
        `INSERT INTO lumy_model_controls
          (provider, model_id, model_scope_key, enabled, updated_by_user_id)
          VALUES (?, ?, ?, FALSE, NULL)
          ON DUPLICATE KEY UPDATE enabled = FALSE,
            updated_by_user_id = NULL`,
        [normalized.provider, normalized.model, normalized.model]
      )
    }
    return { id: incidentId }
  })
}

export async function listIncidentsForAdmin() {
  await ensureDatabaseSchema()
  const [rows] = await getDatabasePool().execute<IncidentRow[]>(
    `SELECT id, request_id, user_id, requested_provider, requested_model,
      provider, model, http_status, failure_kind, sanitized_detail,
      surfaced_to_user, occurrence_count, first_occurred_at,
      last_occurred_at, resolved_at, resolved_by_user_id
      FROM lumy_model_incidents
      ORDER BY resolved_at IS NULL DESC, last_occurred_at DESC LIMIT 500`
  )
  return rows.map((row) => ({
    id: row.id,
    requestId: row.request_id,
    userId: row.user_id,
    requestedProvider: row.requested_provider,
    requestedModel: row.requested_model,
    provider: row.provider,
    model: row.model,
    httpStatus: Number(row.http_status),
    failureKind: row.failure_kind,
    sanitizedDetail: row.sanitized_detail,
    surfacedToUser: Boolean(row.surfaced_to_user),
    occurrenceCount: Number(row.occurrence_count),
    firstOccurredAt: databaseDateToISOString(row.first_occurred_at),
    lastOccurredAt: databaseDateToISOString(row.last_occurred_at),
    resolvedAt: row.resolved_at
      ? databaseDateToISOString(row.resolved_at)
      : null,
    resolvedByUserId: row.resolved_by_user_id,
  }))
}

export async function resolveIncident(
  incidentId: string,
  resolvedByUserId: string
) {
  await ensureDatabaseSchema()
  const [result] = await getDatabasePool().execute<ResultSetHeader>(
    `UPDATE lumy_model_incidents SET resolved_at = CURRENT_TIMESTAMP(3),
      resolved_by_user_id = ? WHERE id = ? AND resolved_at IS NULL`,
    [resolvedByUserId, incidentId]
  )
  return result.affectedRows > 0
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
      isChatDocumentFile({ name: row.name, type: row.mime_type })
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
    createdAt: databaseDateToISOString(row.created_at),
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
    createdAt: databaseDateToISOString(row.created_at),
    updatedAt: databaseDateToISOString(row.updated_at),
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

export type RateLimitDecision = {
  allowed: boolean
  remaining: number
  retryAfterSeconds: number
}

export async function consumeRateLimit(input: {
  scope: string
  limit: number
  windowSeconds: number
}): Promise<RateLimitDecision> {
  await ensureDatabaseSchema()
  const limit = Math.max(1, Math.trunc(input.limit))
  const windowSeconds = Math.max(1, Math.trunc(input.windowSeconds))
  const scopeHash = createHash("sha256").update(input.scope).digest("hex")
  return withTransaction(async (connection) => {
    const [rows] = await connection.execute<
      Array<
        RowDataPacket & {
          hit_count: number
          expired: number
          retry_after: number
        }
      >
    >(
      `SELECT hit_count,
        window_started_at <= TIMESTAMPADD(SECOND, -?, CURRENT_TIMESTAMP(3)) AS expired,
        GREATEST(1, TIMESTAMPDIFF(SECOND, CURRENT_TIMESTAMP(3),
          TIMESTAMPADD(SECOND, ?, window_started_at))) AS retry_after
        FROM lumy_rate_limit_buckets WHERE scope_hash = ? FOR UPDATE`,
      [windowSeconds, windowSeconds, scopeHash]
    )
    const current = rows.at(0)
    if (!current) {
      await connection.execute(
        `INSERT INTO lumy_rate_limit_buckets (scope_hash, hit_count)
          VALUES (?, 1)`,
        [scopeHash]
      )
      return {
        allowed: true,
        remaining: limit - 1,
        retryAfterSeconds: windowSeconds,
      }
    }
    if (current.expired !== 0) {
      await connection.execute(
        `UPDATE lumy_rate_limit_buckets SET hit_count = 1,
          window_started_at = CURRENT_TIMESTAMP(3) WHERE scope_hash = ?`,
        [scopeHash]
      )
      return {
        allowed: true,
        remaining: limit - 1,
        retryAfterSeconds: windowSeconds,
      }
    }
    if (Number(current.hit_count) >= limit) {
      return {
        allowed: false,
        remaining: 0,
        retryAfterSeconds: Number(current.retry_after),
      }
    }
    await connection.execute(
      `UPDATE lumy_rate_limit_buckets SET hit_count = hit_count + 1
        WHERE scope_hash = ?`,
      [scopeHash]
    )
    return {
      allowed: true,
      remaining: Math.max(0, limit - Number(current.hit_count) - 1),
      retryAfterSeconds: Number(current.retry_after),
    }
  })
}

export async function createNotification(input: {
  userId: string
  type: string
  title: string
  body: string
  targetUrl?: string | null
}) {
  await ensureDatabaseSchema()
  const id = randomUUID()
  await getDatabasePool().execute(
    `INSERT INTO lumy_notifications
      (id, user_id, type, title, body, target_url)
      VALUES (?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.userId,
      input.type.slice(0, 50),
      input.title.slice(0, 160),
      input.body.slice(0, 1_000),
      input.targetUrl?.slice(0, 500) ?? null,
    ]
  )
  return { id }
}

export async function listNotifications(userId: string, limit = 100) {
  await ensureDatabaseSchema()
  const [rows] = await getDatabasePool().execute<
    Array<
      RowDataPacket & {
        id: string
        type: string
        title: string
        body: string
        target_url: string | null
        read_at: Date | null
        created_at: Date
      }
    >
  >(
    `SELECT id, type, title, body, target_url, read_at, created_at
      FROM lumy_notifications WHERE user_id = ?
      ORDER BY created_at DESC LIMIT ?`,
    [userId, Math.max(1, Math.min(200, Math.trunc(limit)))]
  )
  return rows.map((row) => ({
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    targetUrl: row.target_url,
    readAt: row.read_at ? databaseDateToISOString(row.read_at) : null,
    createdAt: databaseDateToISOString(row.created_at),
  }))
}

export async function markNotificationsRead(userId: string, ids?: string[]) {
  await ensureDatabaseSchema()
  const normalized = Array.from(new Set(ids ?? [])).slice(0, 200)
  const [result] = normalized.length
    ? await getDatabasePool().execute<ResultSetHeader>(
        `UPDATE lumy_notifications SET read_at = CURRENT_TIMESTAMP(3)
          WHERE user_id = ? AND read_at IS NULL
            AND id IN (${normalized.map(() => "?").join(",")})`,
        [userId, ...normalized]
      )
    : await getDatabasePool().execute<ResultSetHeader>(
        `UPDATE lumy_notifications SET read_at = CURRENT_TIMESTAMP(3)
          WHERE user_id = ? AND read_at IS NULL`,
        [userId]
      )
  return result.affectedRows
}

export async function listPublishedAnnouncements() {
  await ensureDatabaseSchema()
  const [rows] = await getDatabasePool().execute<
    Array<
      RowDataPacket & {
        id: string
        title: string
        body: string
        kind: "welcome" | "changelog" | "maintenance" | "general"
        published_at: Date
        updated_at: Date
      }
    >
  >(
    `SELECT id, title, body, kind, published_at, updated_at
      FROM lumy_announcements WHERE published_at IS NOT NULL
      ORDER BY published_at DESC LIMIT 100`
  )
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    body: row.body,
    kind: row.kind,
    publishedAt: databaseDateToISOString(row.published_at),
    updatedAt: databaseDateToISOString(row.updated_at),
  }))
}

export async function listAnnouncementsForAdmin() {
  await ensureDatabaseSchema()
  const [rows] = await getDatabasePool().execute<
    Array<
      RowDataPacket & {
        id: string
        title: string
        body: string
        kind: "welcome" | "changelog" | "maintenance" | "general"
        published_at: Date | null
        created_at: Date
        updated_at: Date
      }
    >
  >(
    `SELECT id, title, body, kind, published_at, created_at, updated_at
      FROM lumy_announcements ORDER BY created_at DESC LIMIT 500`
  )
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    body: row.body,
    kind: row.kind,
    publishedAt: row.published_at
      ? databaseDateToISOString(row.published_at)
      : null,
    createdAt: databaseDateToISOString(row.created_at),
    updatedAt: databaseDateToISOString(row.updated_at),
  }))
}

export async function upsertAnnouncement(input: {
  id?: string
  title: string
  body: string
  kind: "welcome" | "changelog" | "maintenance" | "general"
  published: boolean
  createdByUserId: string
}) {
  await ensureDatabaseSchema()
  const id = input.id ?? randomUUID()
  await getDatabasePool().execute(
    `INSERT INTO lumy_announcements
      (id, title, body, kind, published_at, created_by)
      VALUES (?, ?, ?, ?, IF(?, CURRENT_TIMESTAMP(3), NULL), ?)
      ON DUPLICATE KEY UPDATE title = VALUES(title), body = VALUES(body),
        kind = VALUES(kind),
        published_at = IF(VALUES(published_at) IS NULL, NULL,
          COALESCE(published_at, VALUES(published_at)))`,
    [
      id,
      input.title.slice(0, 160),
      input.body.slice(0, 20_000),
      input.kind,
      input.published,
      input.createdByUserId,
    ]
  )
  return { id }
}

export async function deleteAnnouncement(id: string) {
  await ensureDatabaseSchema()
  const [result] = await getDatabasePool().execute<ResultSetHeader>(
    "DELETE FROM lumy_announcements WHERE id = ?",
    [id]
  )
  return result.affectedRows > 0
}

export type ModelControl = {
  provider: string
  modelId: string | null
  enabled: boolean
  updatedByUserId: string | null
  updatedAt: string
}

export async function listModelControls(): Promise<ModelControl[]> {
  await ensureDatabaseSchema()
  const [rows] = await getDatabasePool().execute<
    Array<
      RowDataPacket & {
        provider: string
        model_id: string | null
        enabled: number
        updated_by_user_id: string | null
        updated_at: Date
      }
    >
  >(
    `SELECT provider, model_id, enabled, updated_by_user_id, updated_at
      FROM lumy_model_controls ORDER BY provider, model_scope_key`
  )
  return rows.map((row) => ({
    provider: row.provider,
    modelId: row.model_id,
    enabled: Boolean(row.enabled),
    updatedByUserId: row.updated_by_user_id,
    updatedAt: databaseDateToISOString(row.updated_at),
  }))
}

export async function setModelControl(input: {
  provider: string
  modelId?: string | null
  enabled: boolean
  updatedByUserId: string
}) {
  await ensureDatabaseSchema()
  const provider = input.provider.trim().slice(0, 100)
  const modelId = input.modelId?.trim().slice(0, 250) || null
  if (!provider) throw new Error("Fournisseur requis.")
  await getDatabasePool().execute(
    `INSERT INTO lumy_model_controls
      (provider, model_id, model_scope_key, enabled, updated_by_user_id)
      VALUES (?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE model_id = VALUES(model_id),
        enabled = VALUES(enabled), updated_by_user_id = VALUES(updated_by_user_id)`,
    [provider, modelId, modelId ?? "", input.enabled, input.updatedByUserId]
  )
}

export async function isModelEnabled(provider: string, modelId: string) {
  await ensureDatabaseSchema()
  const [rows] = await getDatabasePool().execute<
    Array<RowDataPacket & { model_scope_key: string; enabled: number }>
  >(
    `SELECT model_scope_key, enabled FROM lumy_model_controls
      WHERE provider = ? AND model_scope_key IN ('', ?)
      ORDER BY model_scope_key = ? DESC`,
    [provider, modelId, modelId]
  )
  return modelControlAllows(
    rows.map((row) => ({
      provider,
      modelId: row.model_scope_key || null,
      enabled: Boolean(row.enabled),
    })),
    provider,
    modelId
  )
}

export function modelControlAllows(
  controls: Array<{
    provider: string
    modelId: string | null
    enabled: boolean
  }>,
  provider: string,
  modelId: string
) {
  const providerControl = controls.find(
    (control) => control.provider === provider && control.modelId === null
  )
  const modelControl = controls.find(
    (control) => control.provider === provider && control.modelId === modelId
  )
  return (providerControl?.enabled ?? true) && (modelControl?.enabled ?? true)
}

export async function listModelIncidentStats() {
  await ensureDatabaseSchema()
  const [rows] = await getDatabasePool().execute<
    Array<
      RowDataPacket & {
        provider: string
        model: string
        incident_count: number
        occurrence_count: number
        last_occurred_at: Date
      }
    >
  >(
    `SELECT provider, model, COUNT(*) AS incident_count,
      SUM(occurrence_count) AS occurrence_count,
      MAX(last_occurred_at) AS last_occurred_at
      FROM lumy_model_incidents GROUP BY provider, model
      ORDER BY provider, occurrence_count DESC, model`
  )
  return rows.map((row) => ({
    provider: row.provider,
    model: row.model,
    incidentCount: Number(row.incident_count),
    occurrenceCount: Number(row.occurrence_count),
    lastOccurredAt: databaseDateToISOString(row.last_occurred_at),
  }))
}

export async function listConversationReferences(
  userId: string,
  conversationId: string
) {
  await ensureDatabaseSchema()
  const [rows] = await getDatabasePool().execute<
    Array<
      RowDataPacket & {
        id: string
        referenced_conversation_id: string
        referenced_title: string
        created_at: Date
      }
    >
  >(
    `SELECT id, referenced_conversation_id, referenced_title, created_at
      FROM lumy_conversation_references
      WHERE user_id = ? AND conversation_id = ? ORDER BY created_at`,
    [userId, conversationId]
  )
  return rows.map((row) => ({
    id: row.id,
    conversationId: row.referenced_conversation_id,
    title: row.referenced_title,
    createdAt: databaseDateToISOString(row.created_at),
  }))
}

export async function addConversationReference(input: {
  userId: string
  conversationId: string
  referencedConversationId: string
}) {
  await ensureDatabaseSchema()
  if (input.conversationId === input.referencedConversationId) {
    return { ok: false as const, reason: "same_conversation" as const }
  }
  const saved = await readChatState(input.userId)
  const source = saved?.state.conversations.find(
    (conversation) => conversation.id === input.conversationId
  )
  const referenced = saved?.state.conversations.find(
    (conversation) => conversation.id === input.referencedConversationId
  )
  if (!source || !referenced) {
    return { ok: false as const, reason: "not_found" as const }
  }
  const id = randomUUID()
  await getDatabasePool().execute(
    `INSERT INTO lumy_conversation_references
      (id, user_id, conversation_id, referenced_conversation_id, referenced_title)
      VALUES (?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE referenced_title = VALUES(referenced_title)`,
    [
      id,
      input.userId,
      input.conversationId,
      input.referencedConversationId,
      referenced.title.slice(0, 255),
    ]
  )
  return { ok: true as const, id }
}

export async function removeConversationReference(userId: string, id: string) {
  await ensureDatabaseSchema()
  const [result] = await getDatabasePool().execute<ResultSetHeader>(
    "DELETE FROM lumy_conversation_references WHERE id = ? AND user_id = ?",
    [id, userId]
  )
  return result.affectedRows > 0
}

export async function getConversationReferenceContext(
  userId: string,
  conversationId: string
) {
  const [references, saved] = await Promise.all([
    listConversationReferences(userId, conversationId),
    readChatState(userId),
  ])
  if (!saved || !references.length) return ""
  const referencedIds = new Set(
    references.map((reference) => reference.conversationId)
  )
  return saved.state.conversations
    .filter((conversation) => referencedIds.has(conversation.id))
    .map((conversation) => {
      const transcript = conversation.messages
        .slice(-100)
        .map(
          (message) =>
            `${message.role === "user" ? "Utilisateur" : "Assistant"}: ${message.content}`
        )
        .join("\n")
      return `Conversation référencée « ${conversation.title} » :\n${transcript}`
    })
    .join("\n\n")
    .slice(0, 200_000)
}

export async function createGroupChat(input: {
  ownerUserId: string
  title: string
}) {
  await ensureDatabaseSchema()
  const id = randomUUID()
  await withTransaction(async (connection) => {
    await connection.execute(
      `INSERT INTO lumy_group_chats (id, title, owner_user_id)
        VALUES (?, ?, ?)`,
      [id, input.title.slice(0, 160), input.ownerUserId]
    )
    await connection.execute(
      `INSERT INTO lumy_group_members (group_id, user_id, role)
        VALUES (?, ?, 'owner')`,
      [id, input.ownerUserId]
    )
  })
  return { id }
}

export async function listGroupChats(userId: string) {
  await ensureDatabaseSchema()
  const [rows] = await getDatabasePool().execute<
    Array<
      RowDataPacket & {
        id: string
        title: string
        owner_user_id: string
        role: "owner" | "member"
        member_count: number
        updated_at: Date
      }
    >
  >(
    `SELECT g.id, g.title, g.owner_user_id, membership.role, g.updated_at,
      (SELECT COUNT(*) FROM lumy_group_members gm WHERE gm.group_id = g.id)
        AS member_count
      FROM lumy_group_members membership
      INNER JOIN lumy_group_chats g ON g.id = membership.group_id
      WHERE membership.user_id = ? ORDER BY g.updated_at DESC`,
    [userId]
  )
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    ownerUserId: row.owner_user_id,
    role: row.role,
    memberCount: Number(row.member_count),
    updatedAt: databaseDateToISOString(row.updated_at),
  }))
}

export async function deleteGroupChat(input: {
  userId: string
  groupId: string
}) {
  await ensureDatabaseSchema()
  return withTransaction(async (connection) => {
    const [rows] = await connection.execute<
      Array<RowDataPacket & { role: "owner" | "member" }>
    >(
      `SELECT role FROM lumy_group_members
        WHERE group_id = ? AND user_id = ? LIMIT 1 FOR UPDATE`,
      [input.groupId, input.userId]
    )
    const membership = rows.at(0)
    if (!membership) return { ok: false as const, reason: "not_found" }
    if (membership.role !== "owner") {
      return { ok: false as const, reason: "forbidden" }
    }
    await connection.execute("DELETE FROM lumy_group_chats WHERE id = ?", [
      input.groupId,
    ])
    return { ok: true as const }
  })
}

export async function createGroupInvitation(input: {
  id: string
  groupId: string
  invitedEmail: string
  invitedByUserId: string
  tokenHash: string
  expiresInSeconds: number
}) {
  await ensureDatabaseSchema()
  return withTransaction(async (connection) => {
    const [ownerRows] = await connection.execute<
      Array<RowDataPacket & { title: string }>
    >(
      `SELECT g.title FROM lumy_group_members membership
        INNER JOIN lumy_group_chats g ON g.id = membership.group_id
        WHERE membership.group_id = ? AND membership.user_id = ? AND membership.role = 'owner'
        LIMIT 1 FOR UPDATE`,
      [input.groupId, input.invitedByUserId]
    )
    if (!ownerRows.length) return { ok: false as const, reason: "forbidden" }
    const [userRows] = await connection.execute<
      Array<RowDataPacket & { id: string }>
    >("SELECT id FROM lumy_users WHERE email = ? LIMIT 1", [input.invitedEmail])
    const invitedUserId = userRows.at(0)?.id ?? null
    if (invitedUserId) {
      const [memberRows] = await connection.execute<RowDataPacket[]>(
        `SELECT 1 FROM lumy_group_members
          WHERE group_id = ? AND user_id = ? LIMIT 1`,
        [input.groupId, invitedUserId]
      )
      if (memberRows.length)
        return { ok: false as const, reason: "already_member" }
    }
    await connection.execute(
      `UPDATE lumy_group_invitations SET status = 'expired'
        WHERE group_id = ? AND invited_email = ? AND status = 'pending'`,
      [input.groupId, input.invitedEmail]
    )
    await connection.execute(
      `INSERT INTO lumy_group_invitations
        (id, group_id, invited_email, invited_user_id, invited_by_user_id,
          token_hash, expires_at)
        VALUES (?, ?, ?, ?, ?, ?, TIMESTAMPADD(SECOND, ?, CURRENT_TIMESTAMP(3)))`,
      [
        input.id,
        input.groupId,
        input.invitedEmail,
        invitedUserId,
        input.invitedByUserId,
        input.tokenHash,
        input.expiresInSeconds,
      ]
    )
    if (invitedUserId) {
      await connection.execute(
        `INSERT INTO lumy_notifications
          (id, user_id, type, title, body, target_url)
          VALUES (?, ?, 'group_invitation', 'Invitation à une discussion', ?, '/')`,
        [
          randomUUID(),
          invitedUserId,
          `Vous êtes invité à rejoindre « ${ownerRows[0].title} ».`,
        ]
      )
    }
    return { ok: true as const, groupTitle: ownerRows[0].title }
  })
}

export async function respondToGroupInvitation(input: {
  tokenHash: string
  userId: string
  userEmail: string
  accept: boolean
}) {
  await ensureDatabaseSchema()
  return withTransaction(async (connection) => {
    const [rows] = await connection.execute<
      Array<
        RowDataPacket & {
          id: string
          group_id: string
          invited_email: string
          invited_by_user_id: string
        }
      >
    >(
      `SELECT id, group_id, invited_email, invited_by_user_id
        FROM lumy_group_invitations
        WHERE token_hash = ? AND status = 'pending'
          AND expires_at > CURRENT_TIMESTAMP(3) LIMIT 1 FOR UPDATE`,
      [input.tokenHash]
    )
    const invite = rows.at(0)
    if (
      !invite ||
      invite.invited_email.toLowerCase() !== input.userEmail.toLowerCase()
    )
      return { ok: false as const }
    if (input.accept) {
      await connection.execute(
        `INSERT IGNORE INTO lumy_group_members (group_id, user_id, role)
          VALUES (?, ?, 'member')`,
        [invite.group_id, input.userId]
      )
    }
    await connection.execute(
      `UPDATE lumy_group_invitations SET status = ?, responded_at = CURRENT_TIMESTAMP(3),
        invited_user_id = ? WHERE id = ?`,
      [input.accept ? "accepted" : "declined", input.userId, invite.id]
    )
    await connection.execute(
      `INSERT INTO lumy_notifications
        (id, user_id, type, title, body, target_url)
        VALUES (?, ?, 'group_invitation', ?, ?, ?)`,
      [
        randomUUID(),
        invite.invited_by_user_id,
        input.accept ? "Invitation acceptée" : "Invitation refusée",
        input.accept
          ? "Un membre a rejoint votre discussion de groupe."
          : "Une invitation à votre discussion a été refusée.",
        `/?group=${invite.group_id}`,
      ]
    )
    return { ok: true as const, groupId: invite.group_id }
  })
}

export async function listGroupMessages(userId: string, groupId: string) {
  await ensureDatabaseSchema()
  const [rows] = await getDatabasePool().execute<
    Array<
      RowDataPacket & {
        id: string
        author_user_id: string
        author_name: string
        content: string
        created_at: Date
      }
    >
  >(
    `SELECT message.id, message.author_user_id, author.name AS author_name,
      message.content, message.created_at
      FROM lumy_group_messages message
      INNER JOIN lumy_users author ON author.id = message.author_user_id
      INNER JOIN lumy_group_members membership ON membership.group_id = message.group_id
        AND membership.user_id = ?
      WHERE message.group_id = ? ORDER BY message.created_at ASC LIMIT 1000`,
    [userId, groupId]
  )
  return rows.map((row) => ({
    id: row.id,
    authorUserId: row.author_user_id,
    authorName: row.author_name,
    content: row.content,
    createdAt: databaseDateToISOString(row.created_at),
  }))
}

export async function insertGroupMessage(input: {
  id: string
  groupId: string
  authorUserId: string
  content: string
}) {
  await ensureDatabaseSchema()
  return withTransaction(async (connection) => {
    const [members] = await connection.execute<RowDataPacket[]>(
      `SELECT 1 FROM lumy_group_members WHERE group_id = ? AND user_id = ?
        LIMIT 1 FOR UPDATE`,
      [input.groupId, input.authorUserId]
    )
    if (!members.length) return false
    await connection.execute(
      `INSERT INTO lumy_group_messages
        (id, group_id, author_user_id, content) VALUES (?, ?, ?, ?)`,
      [input.id, input.groupId, input.authorUserId, input.content]
    )
    await connection.execute(
      "UPDATE lumy_group_chats SET updated_at = CURRENT_TIMESTAMP(3) WHERE id = ?",
      [input.groupId]
    )
    await connection.execute(
      `INSERT INTO lumy_notifications (id, user_id, type, title, body, target_url)
        SELECT UUID(), membership.user_id, 'group_message', 'Nouveau message de groupe',
          LEFT(?, 1000), CONCAT('/?group=', ?)
        FROM lumy_group_members membership
        WHERE membership.group_id = ? AND membership.user_id <> ?`,
      [input.content, input.groupId, input.groupId, input.authorUserId]
    )
    return true
  })
}

export type SupportTicketCreateResult =
  | { ok: true; ticketId: string }
  | {
      ok: false
      reason: "active_ticket" | "cooldown"
      retryAfterSeconds: number
    }

export async function createSupportTicket(input: {
  id: string
  requesterUserId: string
  subject: string
  firstMessage: string
}): Promise<SupportTicketCreateResult> {
  await ensureDatabaseSchema()
  return withTransaction(async (connection) => {
    await connection.execute(
      `INSERT IGNORE INTO lumy_support_ticket_cooldowns (user_id)
        VALUES (?)`,
      [input.requesterUserId]
    )
    const [cooldownRows] = await connection.execute<
      Array<
        RowDataPacket & {
          last_created_at: Date | null
          retry_after: number | null
        }
      >
    >(
      `SELECT last_created_at,
        GREATEST(1, TIMESTAMPDIFF(SECOND, CURRENT_TIMESTAMP(3),
          TIMESTAMPADD(HOUR, 1, last_created_at))) AS retry_after
        FROM lumy_support_ticket_cooldowns WHERE user_id = ? FOR UPDATE`,
      [input.requesterUserId]
    )
    const [activeRows] = await connection.execute<RowDataPacket[]>(
      `SELECT 1 FROM lumy_support_tickets
        WHERE requester_user_id = ? AND status <> 'closed'
        LIMIT 1 FOR UPDATE`,
      [input.requesterUserId]
    )
    if (activeRows.length) {
      return {
        ok: false,
        reason: "active_ticket",
        retryAfterSeconds: 3600,
      }
    }
    const cooldown = cooldownRows.at(0)
    if (cooldown?.last_created_at && Number(cooldown.retry_after) > 0) {
      return {
        ok: false,
        reason: "cooldown",
        retryAfterSeconds: Number(cooldown.retry_after),
      }
    }
    await connection.execute(
      `INSERT INTO lumy_support_tickets
        (id, requester_user_id, subject) VALUES (?, ?, ?)`,
      [input.id, input.requesterUserId, input.subject.slice(0, 160)]
    )
    await connection.execute(
      `INSERT INTO lumy_support_messages
        (id, ticket_id, author_user_id, content) VALUES (?, ?, ?, ?)`,
      [randomUUID(), input.id, input.requesterUserId, input.firstMessage]
    )
    await connection.execute(
      `UPDATE lumy_support_ticket_cooldowns
        SET last_created_at = CURRENT_TIMESTAMP(3) WHERE user_id = ?`,
      [input.requesterUserId]
    )
    await connection.execute(
      `INSERT INTO lumy_notifications
        (id, user_id, type, title, body, target_url)
        SELECT UUID(), admin.id, 'support', 'Nouveau ticket d’assistance', ?, ?
        FROM lumy_users admin WHERE admin.role IN ('admin', 'super_admin')
          AND admin.disabled_at IS NULL`,
      [input.subject.slice(0, 1_000), `/?support=${input.id}`]
    )
    return { ok: true, ticketId: input.id }
  })
}

export async function listSupportTickets(userId: string, isAdmin: boolean) {
  await ensureDatabaseSchema()
  const [rows] = await getDatabasePool().execute<
    Array<
      RowDataPacket & {
        id: string
        requester_user_id: string
        requester_name: string
        requester_email: string
        subject: string
        status: "open" | "in_progress" | "closed"
        assigned_admin_id: string | null
        pending_handoff_admin_id: string | null
        created_at: Date
        updated_at: Date
        closed_at: Date | null
      }
    >
  >(
    `SELECT ticket.id, ticket.requester_user_id,
      requester.name AS requester_name, requester.email AS requester_email,
      ticket.subject, ticket.status, ticket.assigned_admin_id,
      ticket.pending_handoff_admin_id, ticket.created_at, ticket.updated_at,
      ticket.closed_at
      FROM lumy_support_tickets ticket
      INNER JOIN lumy_users requester ON requester.id = ticket.requester_user_id
      WHERE (? = TRUE OR ticket.requester_user_id = ?)
      ORDER BY ticket.status = 'closed', ticket.updated_at DESC LIMIT 500`,
    [isAdmin, userId]
  )
  return rows.map((row) => ({
    id: row.id,
    requesterUserId: row.requester_user_id,
    requesterName: row.requester_name,
    requesterEmail: isAdmin ? row.requester_email : undefined,
    subject: row.subject,
    status: row.status,
    assignedAdminId: row.assigned_admin_id,
    pendingHandoffAdminId: row.pending_handoff_admin_id,
    createdAt: databaseDateToISOString(row.created_at),
    updatedAt: databaseDateToISOString(row.updated_at),
    closedAt: row.closed_at ? databaseDateToISOString(row.closed_at) : null,
  }))
}

export async function listSupportMessages(input: {
  ticketId: string
  viewerUserId: string
  viewerIsAdmin: boolean
}) {
  await ensureDatabaseSchema()
  const [rows] = await getDatabasePool().execute<
    Array<
      RowDataPacket & {
        id: string
        author_user_id: string
        author_name: string
        author_role: DatabaseRole
        content: string
        created_at: Date
      }
    >
  >(
    `SELECT message.id, message.author_user_id, author.name AS author_name,
      author.role AS author_role, message.content, message.created_at
      FROM lumy_support_messages message
      INNER JOIN lumy_support_tickets ticket ON ticket.id = message.ticket_id
      INNER JOIN lumy_users author ON author.id = message.author_user_id
      WHERE message.ticket_id = ?
        AND (? = TRUE OR ticket.requester_user_id = ?)
      ORDER BY message.created_at ASC LIMIT 2000`,
    [input.ticketId, input.viewerIsAdmin, input.viewerUserId]
  )
  return rows.map((row) => ({
    id: row.id,
    authorUserId: row.author_user_id,
    authorName: row.author_name,
    authorIsAdmin:
      row.author_role === "admin" || row.author_role === "super_admin",
    content: row.content,
    createdAt: databaseDateToISOString(row.created_at),
  }))
}

export async function claimSupportTicket(
  ticketId: string,
  adminUserId: string
) {
  await ensureDatabaseSchema()
  const [result] = await getDatabasePool().execute<ResultSetHeader>(
    `UPDATE lumy_support_tickets SET assigned_admin_id = ?, status = 'in_progress'
      WHERE id = ? AND status <> 'closed'
        AND (assigned_admin_id IS NULL OR assigned_admin_id = ?)`,
    [adminUserId, ticketId, adminUserId]
  )
  if (result.affectedRows) {
    const [ticketRows] = await getDatabasePool().execute<
      Array<RowDataPacket & { requester_user_id: string }>
    >("SELECT requester_user_id FROM lumy_support_tickets WHERE id = ?", [
      ticketId,
    ])
    const requesterUserId = ticketRows.at(0)?.requester_user_id
    if (requesterUserId) {
      await createNotification({
        userId: requesterUserId,
        type: "support",
        title: "Un administrateur a rejoint votre ticket",
        body: "Votre demande d’assistance est maintenant prise en charge.",
        targetUrl: `/?support=${ticketId}`,
      })
    }
  }
  return result.affectedRows > 0
}

export async function requestSupportHandoff(input: {
  ticketId: string
  currentAdminUserId: string
  targetAdminUserId: string
}) {
  await ensureDatabaseSchema()
  const [result] = await getDatabasePool().execute<ResultSetHeader>(
    `UPDATE lumy_support_tickets SET pending_handoff_admin_id = ?
      WHERE id = ? AND status = 'in_progress' AND assigned_admin_id = ?
        AND ? <> assigned_admin_id
        AND EXISTS (SELECT 1 FROM lumy_users target
          WHERE target.id = ? AND target.role IN ('admin', 'super_admin')
            AND target.disabled_at IS NULL)`,
    [
      input.targetAdminUserId,
      input.ticketId,
      input.currentAdminUserId,
      input.targetAdminUserId,
      input.targetAdminUserId,
    ]
  )
  if (result.affectedRows) {
    await createNotification({
      userId: input.targetAdminUserId,
      type: "support_handoff",
      title: "Transfert de ticket proposé",
      body: "Un administrateur souhaite vous transférer un ticket d’assistance.",
      targetUrl: `/?support=${input.ticketId}`,
    })
  }
  return result.affectedRows > 0
}

export async function acceptSupportHandoff(
  ticketId: string,
  targetAdminUserId: string
) {
  await ensureDatabaseSchema()
  const [result] = await getDatabasePool().execute<ResultSetHeader>(
    `UPDATE lumy_support_tickets SET assigned_admin_id = ?,
      pending_handoff_admin_id = NULL
      WHERE id = ? AND status = 'in_progress'
        AND pending_handoff_admin_id = ?`,
    [targetAdminUserId, ticketId, targetAdminUserId]
  )
  return result.affectedRows > 0
}

export async function closeSupportTicket(input: {
  ticketId: string
  actorUserId: string
  actorIsAdmin: boolean
}) {
  await ensureDatabaseSchema()
  const [result] = await getDatabasePool().execute<ResultSetHeader>(
    `UPDATE lumy_support_tickets SET status = 'closed',
      closed_at = CURRENT_TIMESTAMP(3), pending_handoff_admin_id = NULL
      WHERE id = ? AND status <> 'closed'
        AND (? = TRUE OR requester_user_id = ?)`,
    [input.ticketId, input.actorIsAdmin, input.actorUserId]
  )
  return result.affectedRows > 0
}

export async function insertSupportMessage(input: {
  id: string
  ticketId: string
  authorUserId: string
  authorIsAdmin: boolean
  content: string
}) {
  await ensureDatabaseSchema()
  return withTransaction(async (connection) => {
    const [rows] = await connection.execute<
      Array<
        RowDataPacket & {
          requester_user_id: string
          assigned_admin_id: string | null
          status: "open" | "in_progress" | "closed"
        }
      >
    >(
      `SELECT requester_user_id, assigned_admin_id, status
        FROM lumy_support_tickets WHERE id = ? LIMIT 1 FOR UPDATE`,
      [input.ticketId]
    )
    const ticket = rows.at(0)
    if (!ticket || ticket.status === "closed") return false
    const canWrite = canWriteSupportTicket(
      {
        requesterUserId: ticket.requester_user_id,
        assignedAdminId: ticket.assigned_admin_id,
        status: ticket.status,
      },
      input.authorUserId,
      input.authorIsAdmin
    )
    if (!canWrite) return false
    await connection.execute(
      `INSERT INTO lumy_support_messages
        (id, ticket_id, author_user_id, content) VALUES (?, ?, ?, ?)`,
      [input.id, input.ticketId, input.authorUserId, input.content]
    )
    await connection.execute(
      "UPDATE lumy_support_tickets SET updated_at = CURRENT_TIMESTAMP(3) WHERE id = ?",
      [input.ticketId]
    )
    const recipientUserId = input.authorIsAdmin
      ? ticket.requester_user_id
      : ticket.assigned_admin_id
    if (recipientUserId) {
      await connection.execute(
        `INSERT INTO lumy_notifications
          (id, user_id, type, title, body, target_url)
          VALUES (?, ?, 'support', 'Nouveau message d’assistance', ?, ?)`,
        [
          randomUUID(),
          recipientUserId,
          input.content.slice(0, 1_000),
          `/?support=${input.ticketId}`,
        ]
      )
    }
    return true
  })
}

export function canWriteSupportTicket(
  ticket: {
    requesterUserId: string
    assignedAdminId: string | null
    status: "open" | "in_progress" | "closed"
  },
  actorUserId: string,
  actorIsAdmin: boolean
) {
  if (ticket.status === "closed") return false
  return actorIsAdmin
    ? ticket.assignedAdminId === actorUserId
    : ticket.requesterUserId === actorUserId
}
