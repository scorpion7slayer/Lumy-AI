import { createFileRoute } from "@tanstack/react-router"
import { assertSameOrigin, requireRequestUser } from "@/lib/auth.server"
import { listNotifications, markNotificationsRead } from "@/lib/db.server"
import { readLimitedJsonObject } from "@/lib/request-guards.server"

export const Route = createFileRoute("/api/notifications")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const user = await requireRequestUser(request)
        const notifications = await listNotifications(user.id)
        return Response.json({
          notifications,
          unreadCount: notifications.filter((item) => !item.readAt).length,
        })
      },
      PATCH: async ({ request }) => {
        assertSameOrigin(request)
        const user = await requireRequestUser(request)
        const body = await readLimitedJsonObject(request)
        const ids = Array.isArray(body.ids)
          ? body.ids
              .filter((id): id is string => typeof id === "string")
              .slice(0, 200)
          : undefined
        const updated = await markNotificationsRead(user.id, ids)
        return Response.json({ updated })
      },
    },
  },
})
