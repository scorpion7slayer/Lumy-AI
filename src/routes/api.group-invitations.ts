import { createHash, randomBytes, randomUUID } from "node:crypto"
import { createFileRoute } from "@tanstack/react-router"
import { assertSameOrigin, requireRequestUser } from "@/lib/auth.server"
import {
  consumeRateLimit,
  createGroupInvitation,
  createNotification,
  respondToGroupInvitation,
} from "@/lib/db.server"
import { sendGroupInvitationEmail } from "@/lib/email.server"
import { readLimitedJsonObject } from "@/lib/request-guards.server"

const INVITATION_DURATION_SECONDS = 7 * 24 * 60 * 60

export const Route = createFileRoute("/api/group-invitations")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        assertSameOrigin(request)
        const user = await requireRequestUser(request)
        const rate = await consumeRateLimit({
          scope: `group-invite:${user.id}`,
          limit: 20,
          windowSeconds: 3600,
        })
        if (!rate.allowed) {
          return Response.json(
            { error: "Trop d’invitations envoyées. Réessayez plus tard." },
            {
              status: 429,
              headers: { "Retry-After": String(rate.retryAfterSeconds) },
            }
          )
        }
        const body = await readLimitedJsonObject(request)
        const groupId =
          typeof body.groupId === "string" ? body.groupId.trim() : ""
        const email =
          typeof body.email === "string" ? body.email.trim().toLowerCase() : ""
        if (
          !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
          email.length > 191 ||
          !groupId
        ) {
          return Response.json(
            { error: "Invitation invalide." },
            { status: 400 }
          )
        }
        const id = randomUUID()
        const token = randomBytes(32).toString("base64url")
        const result = await createGroupInvitation({
          id,
          groupId,
          invitedEmail: email,
          invitedByUserId: user.id,
          tokenHash: createHash("sha256").update(token).digest("hex"),
          expiresInSeconds: INVITATION_DURATION_SECONDS,
        })
        if (!result.ok) {
          return Response.json(
            {
              error:
                result.reason === "already_member"
                  ? "Cette personne participe déjà au groupe."
                  : "Seul le propriétaire peut inviter des membres.",
            },
            { status: result.reason === "already_member" ? 409 : 403 }
          )
        }
        try {
          await sendGroupInvitationEmail({
            invitationId: id,
            recipient: email,
            inviterName: user.name,
            groupTitle: result.groupTitle,
            token,
          })
        } catch (error) {
          console.error(
            "[Lumy] Invitation de groupe enregistrée mais e-mail impossible",
            error
          )
        }
        return Response.json({ invited: true }, { status: 201 })
      },
      PATCH: async ({ request }) => {
        assertSameOrigin(request)
        const user = await requireRequestUser(request)
        const body = await readLimitedJsonObject(request)
        const token = typeof body.token === "string" ? body.token.trim() : ""
        const accept = body.action === "accept"
        if (!token || (!accept && body.action !== "decline")) {
          return Response.json(
            { error: "Réponse d’invitation invalide." },
            { status: 400 }
          )
        }
        const result = await respondToGroupInvitation({
          tokenHash: createHash("sha256").update(token).digest("hex"),
          userId: user.id,
          userEmail: user.email,
          accept,
        })
        if (!result.ok)
          return Response.json(
            { error: "Invitation invalide ou expirée." },
            { status: 404 }
          )
        if (accept) {
          await createNotification({
            userId: user.id,
            type: "group_invitation",
            title: "Invitation acceptée",
            body: "Vous avez rejoint une discussion de groupe.",
            targetUrl: `/?group=${result.groupId}`,
          })
        }
        return Response.json({ updated: true, groupId: result.groupId })
      },
    },
  },
})
