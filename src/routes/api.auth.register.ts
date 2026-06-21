import { randomUUID } from "node:crypto"
import { createFileRoute } from "@tanstack/react-router"
import {
  assertSameOrigin,
  createAuthSession,
  enforceAuthRateLimit,
  hashPassword,
  isDuplicateEntry,
  publicUser,
  validateAccountInput,
} from "@/lib/auth.server"
import { insertUser } from "@/lib/db.server"

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

        const user = {
          id: randomUUID(),
          name: validated.name,
          email: validated.email,
          passwordHash: await hashPassword(validated.password),
          createdAt: new Date().toISOString(),
        }

        try {
          await insertUser(user)
          const cookie = await createAuthSession(user.id)
          return Response.json(
            { user: publicUser(user) },
            { status: 201, headers: { "Set-Cookie": cookie } }
          )
        } catch (error) {
          if (isDuplicateEntry(error)) {
            return Response.json(
              { error: "Un compte utilise déjà cette adresse e-mail." },
              { status: 409 }
            )
          }
          console.error("[Lumy] Création de compte impossible", error)
          return Response.json(
            { error: "Création de compte impossible." },
            { status: 500 }
          )
        }
      },
    },
  },
})
