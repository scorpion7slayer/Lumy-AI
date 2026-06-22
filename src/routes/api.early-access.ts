import { createFileRoute } from "@tanstack/react-router"
import {
  assertSameOrigin,
  issueEarlyAccessRequest,
  requireAuthenticatedUser,
} from "@/lib/auth.server"
import { consumeRateLimit, getEarlyAccessStatus } from "@/lib/db.server"

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
        const rate = await consumeRateLimit({
          scope: `early-access:${user.id}`,
          limit: 3,
          windowSeconds: 3600,
        })
        if (!rate.allowed) {
          return Response.json(
            { error: "Trop de demandes. Réessayez plus tard." },
            {
              status: 429,
              headers: { "Retry-After": String(rate.retryAfterSeconds) },
            }
          )
        }
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
