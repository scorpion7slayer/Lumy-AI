import { randomUUID } from "node:crypto"
import { createFileRoute } from "@tanstack/react-router"
import {
  assertSameOrigin,
  enforceAuthRateLimit,
  hashPassword,
  isDuplicateEntry,
  issueEmailVerification,
  validateAccountInput,
} from "@/lib/auth.server"
import { isEmailDeliveryConfigured } from "@/lib/email.server"
import { deleteUnverifiedUser, insertUser } from "@/lib/db.server"

export const Route = createFileRoute("/api/auth/register")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        assertSameOrigin(request)
        enforceAuthRateLimit(request, "register")
        let body: { name?: unknown; email?: unknown; password?: unknown }
        try {
          body = await request.json()
        } catch {
          return Response.json(
            { error: "Corps JSON invalide." },
            { status: 400 }
          )
        }

        const validated = validateAccountInput(body)
        if ("error" in validated)
          return Response.json(validated, { status: 400 })
        if (!isEmailDeliveryConfigured()) {
          return Response.json(
            {
              error:
                "La vérification d’e-mail n’est pas configurée. Contactez l’administrateur.",
            },
            { status: 503 }
          )
        }

        const user = {
          id: randomUUID(),
          name: validated.name,
          email: validated.email,
          passwordHash: await hashPassword(validated.password),
          createdAt: new Date().toISOString(),
          role: "user" as const,
        }

        let inserted = false
        try {
          await insertUser(user)
          inserted = true
          await issueEmailVerification({
            userId: user.id,
            email: user.email,
            name: user.name,
            purpose: "verify_email",
          })
          return Response.json(
            { verificationRequired: true, email: user.email },
            { status: 201 }
          )
        } catch (error) {
          if (inserted) await deleteUnverifiedUser(user.id)
          if (isDuplicateEntry(error)) {
            return Response.json(
              { error: "Un compte utilise déjà cette adresse e-mail." },
              { status: 409 }
            )
          }
          console.error("[Lumy] Vérification du compte impossible", error)
          return Response.json(
            {
              error:
                "L’e-mail de vérification n’a pas pu être envoyé. Réessayez plus tard.",
            },
            { status: 500 }
          )
        }
      },
    },
  },
})
