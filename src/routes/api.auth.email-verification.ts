import { createFileRoute } from "@tanstack/react-router"
import {
  assertSameOrigin,
  createAuthSession,
  enforceAuthRateLimit,
  hashSessionToken,
  isDuplicateEntry,
  issueEmailVerification,
  normalizeEmail,
} from "@/lib/auth.server"
import { consumeVerificationToken, findUserByEmail } from "@/lib/db.server"
import { isEmailDeliveryConfigured } from "@/lib/email.server"

export const Route = createFileRoute("/api/auth/email-verification")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        assertSameOrigin(request)
        enforceAuthRateLimit(request, "verify")
        const body = (await request.json().catch(() => ({}))) as {
          email?: unknown
        }
        const email =
          typeof body.email === "string" ? normalizeEmail(body.email) : ""
        if (!email) {
          return Response.json(
            { error: "Adresse e-mail requise." },
            { status: 400 }
          )
        }
        if (!isEmailDeliveryConfigured()) {
          return Response.json(
            { error: "Le service d’e-mail n’est pas configuré." },
            { status: 503 }
          )
        }

        const user = await findUserByEmail(email)
        if (user && !user.emailVerifiedAt && !user.disabledAt) {
          await issueEmailVerification({
            userId: user.id,
            email: user.email,
            name: user.name,
            purpose: "verify_email",
          })
        }
        return Response.json(
          {
            message:
              "Si ce compte existe et reste à vérifier, un nouvel e-mail a été envoyé.",
          },
          { status: 202 }
        )
      },
      PATCH: async ({ request }) => {
        assertSameOrigin(request)
        enforceAuthRateLimit(request, "verify")
        const body = (await request.json().catch(() => ({}))) as {
          token?: unknown
        }
        const token = typeof body.token === "string" ? body.token.trim() : ""
        if (!/^[A-Za-z0-9_-]{32,100}$/.test(token)) {
          return Response.json(
            { error: "Lien de vérification invalide." },
            { status: 400 }
          )
        }

        try {
          const verified = await consumeVerificationToken(
            hashSessionToken(token)
          )
          if (!verified) {
            return Response.json(
              { error: "Ce lien est invalide ou a expiré." },
              { status: 410 }
            )
          }
          const cookie = await createAuthSession(verified.userId)
          return Response.json(
            { verified: true, email: verified.email },
            { headers: { "Set-Cookie": cookie } }
          )
        } catch (error) {
          if (isDuplicateEntry(error)) {
            return Response.json(
              { error: "Cette adresse e-mail est déjà utilisée." },
              { status: 409 }
            )
          }
          throw error
        }
      },
    },
  },
})
