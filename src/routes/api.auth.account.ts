import { createFileRoute } from "@tanstack/react-router"
import {
  assertSameOrigin,
  clearSessionCookie,
  hashPassword,
  isDuplicateEntry,
  issueEmailVerification,
  normalizeEmail,
  requireRequestUser,
  verifyPassword,
} from "@/lib/auth.server"
import { isEmailDeliveryConfigured } from "@/lib/email.server"
import { deleteUserAccount, findUserByEmail, updateUser } from "@/lib/db.server"
import { getPasswordStrength } from "@/lib/password-strength"

export const Route = createFileRoute("/api/auth/account")({
  server: {
    handlers: {
      PATCH: async ({ request }) => {
        assertSameOrigin(request)
        const sessionUser = await requireRequestUser(request)
        let body: {
          name?: unknown
          email?: unknown
          currentPassword?: unknown
          newPassword?: unknown
        }
        try {
          body = await request.json()
        } catch {
          return Response.json(
            { error: "Corps JSON invalide." },
            { status: 400 }
          )
        }

        const name =
          typeof body.name === "string" ? body.name.trim() : sessionUser.name
        const email =
          typeof body.email === "string"
            ? normalizeEmail(body.email)
            : sessionUser.email
        const currentPassword =
          typeof body.currentPassword === "string" ? body.currentPassword : ""
        const newPassword =
          typeof body.newPassword === "string" ? body.newPassword : ""

        if (name.length < 2 || name.length > 100) {
          return Response.json({ error: "Nom invalide." }, { status: 400 })
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 191) {
          return Response.json(
            { error: "Adresse e-mail invalide." },
            { status: 400 }
          )
        }
        if (
          sessionUser.capabilities.superAdminAccess &&
          email !== sessionUser.email
        ) {
          return Response.json(
            {
              error:
                "L’adresse du compte propriétaire ne peut pas être modifiée depuis l’interface.",
            },
            { status: 400 }
          )
        }
        if (
          newPassword &&
          (newPassword.length < 10 ||
            new TextEncoder().encode(newPassword).byteLength > 72 ||
            !getPasswordStrength(newPassword).secure)
        ) {
          return Response.json(
            {
              error:
                "Le nouveau mot de passe doit être sécurisé et contenir entre 10 et 72 octets.",
            },
            { status: 400 }
          )
        }

        const storedUser = await findUserByEmail(sessionUser.email)
        if (!storedUser)
          return Response.json(
            { error: "Compte introuvable." },
            { status: 404 }
          )

        const sensitiveChange =
          email !== sessionUser.email || Boolean(newPassword)
        if (
          sensitiveChange &&
          !(await verifyPassword(currentPassword, storedUser.passwordHash))
        ) {
          return Response.json(
            { error: "Mot de passe actuel incorrect." },
            { status: 401 }
          )
        }

        try {
          if (email !== sessionUser.email) {
            if (!isEmailDeliveryConfigured()) {
              return Response.json(
                {
                  error:
                    "Le service de vérification d’e-mail n’est pas configuré.",
                },
                { status: 503 }
              )
            }
            const existing = await findUserByEmail(email)
            if (existing && existing.id !== sessionUser.id) {
              return Response.json(
                { error: "Cette adresse e-mail est déjà utilisée." },
                { status: 409 }
              )
            }
            await issueEmailVerification({
              userId: sessionUser.id,
              email,
              name,
              purpose: "change_email",
            })
          }
          await updateUser({
            id: sessionUser.id,
            name,
            passwordHash: newPassword
              ? await hashPassword(newPassword)
              : undefined,
          })
          return Response.json({
            user: { ...sessionUser, name },
            emailChangePending: email !== sessionUser.email ? email : undefined,
          })
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
      DELETE: async ({ request }) => {
        assertSameOrigin(request)
        const sessionUser = await requireRequestUser(request)
        if (sessionUser.capabilities.superAdminAccess) {
          return Response.json(
            { error: "Le compte propriétaire ne peut pas être supprimé." },
            { status: 400 }
          )
        }
        let body: { password?: unknown }
        try {
          body = await request.json()
        } catch {
          return Response.json(
            { error: "Corps JSON invalide." },
            { status: 400 }
          )
        }
        const password = typeof body.password === "string" ? body.password : ""
        const storedUser = await findUserByEmail(sessionUser.email)
        if (
          !storedUser ||
          !(await verifyPassword(password, storedUser.passwordHash))
        ) {
          return Response.json(
            { error: "Mot de passe incorrect." },
            { status: 401 }
          )
        }

        await deleteUserAccount(sessionUser.id)
        return new Response(null, {
          status: 204,
          headers: { "Set-Cookie": clearSessionCookie() },
        })
      },
    },
  },
})
