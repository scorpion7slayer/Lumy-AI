import { createFileRoute } from "@tanstack/react-router"
import {
  assertSameOrigin,
  issueEarlyAccessRequest,
  requireAuthenticatedUser,
} from "@/lib/auth.server"
import { getEarlyAccessStatus } from "@/lib/db.server"

export const Route = createFileRoute("/api/early-access")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const user = await requireAuthenticatedUser(request)
        const access = await getEarlyAccessStatus(user.id)
        if (!access) {
          return Response.json(
            { error: "Compte introuvable." },
            { status: 404 }
          )
        }
        return Response.json({
          status: access.status,
          requestedAt: access.requestedAt,
          reviewedAt: access.reviewedAt,
          canAccess: access.canAccess,
        })
      },
      POST: async ({ request }) => {
        assertSameOrigin(request)
        const user = await requireAuthenticatedUser(request)
        const access = await issueEarlyAccessRequest(user)
        if (!access) {
          return Response.json(
            { error: "Compte introuvable." },
            { status: 404 }
          )
        }
        return Response.json({
          status: access.status,
          requestedAt: access.requestedAt,
          reviewedAt: access.reviewedAt,
          canAccess: access.canAccess,
          notificationSent: access.notificationSent,
        })
      },
    },
  },
})
