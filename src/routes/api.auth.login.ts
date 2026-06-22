import { createFileRoute } from "@tanstack/react-router"
import {
  assertSameOrigin,
  createAuthSession,
  enforceAuthRateLimit,
  normalizeEmail,
  publicUser,
  verifyPassword,
} from "@/lib/auth.server"
import { findUserByEmail } from "@/lib/db.server"

export const Route = createFileRoute("/api/auth/login")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        assertSameOrigin(request)
        enforceAuthRateLimit(request, "login")
        let body: { email?: unknown; password?: unknown }
        try {
          body = await request.json()
        } catch {
          return Response.json(
            { error: "Corps JSON invalide." },
            { status: 400 }
          )
        }

        const email =
          typeof body.email === "string" ? normalizeEmail(body.email) : ""
        const password = typeof body.password === "string" ? body.password : ""
        if (!email || !password) {
          return Response.json(
            { error: "E-mail et mot de passe requis." },
            { status: 400 }
          )
        }

        const user = await findUserByEmail(email)
        if (!user || !(await verifyPassword(password, user.passwordHash))) {
          return Response.json(
            { error: "E-mail ou mot de passe incorrect." },
            { status: 401 }
          )
        }
        if (user.disabledAt) {
          return Response.json(
            { error: "Ce compte a été désactivé par un administrateur." },
            { status: 403 }
          )
        }
        if (!user.emailVerifiedAt) {
          return Response.json(
            {
              error: "Vérifiez votre adresse e-mail avant de vous connecter.",
              code: "EMAIL_UNVERIFIED",
              email: user.email,
            },
            { status: 403 }
          )
        }

        const cookie = await createAuthSession(user.id)
        return Response.json(
          { user: publicUser(user) },
          { headers: { "Set-Cookie": cookie } }
        )
      },
    },
  },
})
