import { createFileRoute } from "@tanstack/react-router"
import {
  assertSameOrigin,
  requireRequestUser,
  requireSuperAdmin,
} from "@/lib/auth.server"
import {
  deleteAnnouncement,
  listAnnouncementsForAdmin,
  listPublishedAnnouncements,
  upsertAnnouncement,
} from "@/lib/db.server"
import { readLimitedJsonObject } from "@/lib/request-guards.server"

const announcementKinds = [
  "welcome",
  "changelog",
  "maintenance",
  "general",
] as const

export const Route = createFileRoute("/api/announcements")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const all = new URL(request.url).searchParams.get("all") === "1"
        if (all) {
          await requireSuperAdmin(request)
          return Response.json({
            announcements: await listAnnouncementsForAdmin(),
          })
        }
        await requireRequestUser(request)
        return Response.json({
          announcements: await listPublishedAnnouncements(),
        })
      },
      POST: async ({ request }) => {
        assertSameOrigin(request)
        const admin = await requireSuperAdmin(request)
        const body = await readLimitedJsonObject(request)
        const title = typeof body.title === "string" ? body.title.trim() : ""
        const content = typeof body.body === "string" ? body.body.trim() : ""
        const kind = announcementKinds.includes(
          body.kind as (typeof announcementKinds)[number]
        )
          ? (body.kind as (typeof announcementKinds)[number])
          : "general"
        if (
          title.length < 3 ||
          title.length > 160 ||
          content.length < 3 ||
          content.length > 20_000
        ) {
          return Response.json({ error: "Annonce invalide." }, { status: 400 })
        }
        const result = await upsertAnnouncement({
          id: typeof body.id === "string" ? body.id : undefined,
          title,
          body: content,
          kind,
          published: body.published !== false,
          createdByUserId: admin.id,
        })
        return Response.json(result, { status: body.id ? 200 : 201 })
      },
      DELETE: async ({ request }) => {
        assertSameOrigin(request)
        await requireSuperAdmin(request)
        const id = new URL(request.url).searchParams.get("id")?.trim() ?? ""
        const deleted = id ? await deleteAnnouncement(id) : false
        return deleted
          ? new Response(null, { status: 204 })
          : Response.json({ error: "Annonce introuvable." }, { status: 404 })
      },
    },
  },
})
