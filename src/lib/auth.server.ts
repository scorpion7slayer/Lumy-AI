import { createHash, randomBytes, randomUUID } from "node:crypto"
import bcrypt from "bcryptjs"
import type { AuthUser } from "@/lib/auth-types"
import type { VerificationPurpose } from "@/lib/email.server"
import { sendVerificationEmail } from "@/lib/email.server"
import {
  deleteSessionByHash,
  findUserBySessionHash,
  insertVerificationToken,
  insertSession,
} from "@/lib/db.server"
import { getPasswordStrength } from "@/lib/password-strength"

const COOKIE_NAME = "lumy_session"
const SESSION_DURATION_SECONDS = 60 * 60 * 24 * 30
const AUTH_WINDOW_MS = 15 * 60 * 1000
const AUTH_ATTEMPT_LIMIT = 12
const EMAIL_VERIFICATION_DURATION_SECONDS = 30 * 60

declare global {
  var __lumyAuthAttempts:
    | Map<string, { count: number; resetAt: number }>
    | undefined
}

export function enforceAuthRateLimit(
  request: Request,
  action: "login" | "register" | "verify" | "feedback"
) {
  const forwarded = request.headers
    .get("x-forwarded-for")
    ?.split(",")[0]
    ?.trim()
  const address =
    request.headers.get("cf-connecting-ip") ?? forwarded ?? "local"
  const key = `${action}:${address}`
  const now = Date.now()
  const attempts = globalThis.__lumyAuthAttempts ?? new Map()
  globalThis.__lumyAuthAttempts = attempts
  const current = attempts.get(key)
  if (!current || current.resetAt <= now) {
    attempts.set(key, { count: 1, resetAt: now + AUTH_WINDOW_MS })
    return
  }
  if (current.count >= AUTH_ATTEMPT_LIMIT) {
    throw new Response("Trop de tentatives. Réessayez dans quelques minutes.", {
      status: 429,
      headers: {
        "Retry-After": String(Math.ceil((current.resetAt - now) / 1000)),
      },
    })
  }
  current.count += 1
}

export function publicUser(user: {
  id: string
  email: string
  name: string
  createdAt: string
  role: "user" | "admin"
  emailVerifiedAt: string | null
  disabledAt: string | null
}): AuthUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    createdAt: user.createdAt,
    role: user.role,
    emailVerified: Boolean(user.emailVerifiedAt),
    disabled: Boolean(user.disabledAt),
  }
}

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase()
}

export function validateAccountInput(input: {
  name?: unknown
  email?: unknown
  password?: unknown
}) {
  const name = typeof input.name === "string" ? input.name.trim() : ""
  const email =
    typeof input.email === "string" ? normalizeEmail(input.email) : ""
  const password = typeof input.password === "string" ? input.password : ""
  const passwordBytes = new TextEncoder().encode(password).byteLength

  if (name.length < 2 || name.length > 100)
    return { error: "Le nom doit contenir entre 2 et 100 caractères." }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 191) {
    return { error: "Adresse e-mail invalide." }
  }
  if (password.length < 10)
    return { error: "Le mot de passe doit contenir au moins 10 caractères." }
  if (passwordBytes > 72) return { error: "Le mot de passe est trop long." }
  if (!getPasswordStrength(password).secure) {
    return {
      error:
        "Le mot de passe doit combiner plusieurs types de caractères et être plus difficile à deviner.",
    }
  }
  return { name, email, password }
}

export function hashSessionToken(token: string) {
  return createHash("sha256").update(token).digest("hex")
}

function parseCookies(request: Request) {
  const cookies = new Map<string, string>()
  for (const part of (request.headers.get("cookie") ?? "").split(";")) {
    const separator = part.indexOf("=")
    if (separator < 0) continue
    cookies.set(
      part.slice(0, separator).trim(),
      decodeURIComponent(part.slice(separator + 1).trim())
    )
  }
  return cookies
}

export function assertSameOrigin(request: Request) {
  const origin = request.headers.get("origin")
  const requestOrigin = new URL(request.url).origin
  if (
    request.headers.get("sec-fetch-site") === "cross-site" ||
    (origin && origin !== requestOrigin)
  ) {
    throw new Response("Requête intersite refusée.", { status: 403 })
  }
}

export async function createAuthSession(userId: string) {
  const token = randomBytes(32).toString("base64url")
  await insertSession({
    id: randomUUID(),
    tokenHash: hashSessionToken(token),
    userId,
    expiresInSeconds: SESSION_DURATION_SECONDS,
  })
  return serializeSessionCookie(token, SESSION_DURATION_SECONDS)
}

export function serializeSessionCookie(token: string, maxAge: number) {
  return [
    `${COOKIE_NAME}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAge}`,
    process.env.NODE_ENV === "production" ? "Secure" : "",
  ]
    .filter(Boolean)
    .join("; ")
}

export function clearSessionCookie() {
  return serializeSessionCookie("", 0)
}

export async function getRequestUser(request: Request) {
  const token = parseCookies(request).get(COOKIE_NAME)
  if (!token) return null
  const user = await findUserBySessionHash(hashSessionToken(token))
  return user ? publicUser(user) : null
}

export async function requireRequestUser(request: Request) {
  const user = await getRequestUser(request)
  if (!user) throw new Response("Authentification requise.", { status: 401 })
  return user
}

export async function requireAdmin(request: Request) {
  const user = await requireRequestUser(request)
  if (user.role !== "admin") {
    throw new Response("Accès administrateur requis.", { status: 403 })
  }
  return user
}

export async function issueEmailVerification(input: {
  userId: string
  email: string
  name: string
  purpose: VerificationPurpose
}) {
  const id = randomUUID()
  const token = randomBytes(32).toString("base64url")
  await insertVerificationToken({
    id,
    userId: input.userId,
    tokenHash: hashSessionToken(token),
    email: input.email,
    purpose: input.purpose,
    expiresInSeconds: EMAIL_VERIFICATION_DURATION_SECONDS,
  })
  await sendVerificationEmail({
    email: input.email,
    name: input.name,
    token,
    purpose: input.purpose,
    idempotencyKey: `lumy-verification/${id}`,
  })
}

export async function destroyRequestSession(request: Request) {
  const token = parseCookies(request).get(COOKIE_NAME)
  if (token) await deleteSessionByHash(hashSessionToken(token))
}

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 12)
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash)
}

export function isDuplicateEntry(error: unknown) {
  return Boolean(
    error &&
    typeof error === "object" &&
    "code" in error &&
    (error as { code?: unknown }).code === "ER_DUP_ENTRY"
  )
}
