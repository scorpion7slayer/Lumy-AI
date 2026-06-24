import { createFileRoute } from "@tanstack/react-router"
import { assertSameOrigin, requireRequestUser } from "@/lib/auth.server"
import {
  consumeRateLimit,
  createGroupChat,
  deleteGroupChat,
  listGroupChats,
} from "@/lib/db.server"
import { readLimitedJsonObject } from "@/lib/request-guards.server"

export const Route = createFileRoute("/api/groups")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const user = await requireRequestUser(request)
        return Response.json({ groups: await listGroupChats(user.id) })
      },
      POST: async ({ request }) => {
        assertSameOrigin(request)
        const user = await requireRequestUser(request)
        const rate = await consumeRateLimit({
          scope: `group-create:${user.id}`,
          limit: 5,
          windowSeconds: 3600,
        })
        if (!rate.allowed) {
          return Response.json(
            { error: "Trop de groupes créés. Réessayez plus tard." },
            {
              status: 429,
              headers: { "Retry-After": String(rate.retryAfterSeconds) },
            }
          )
        }
        const body = await readLimitedJsonObject(request)
        const title = typeof body.title === "string" ? body.title.trim() : ""
        if (title.length < 2 || title.length > 160) {
          return Response.json(
            { error: "Le titre doit contenir entre 2 et 160 caractères." },
            { status: 400 }
          )
        }
        return Response.json(
          await createGroupChat({ ownerUserId: user.id, title }),
          { status: 201 }
        )
      },
      DELETE: async ({ request }) => {
        assertSameOrigin(request)
        const user = await requireRequestUser(request)
        const groupId = new URL(request.url).searchParams.get("groupId")?.trim()
        if (!groupId) {
          return Response.json({ error: "Groupe requis." }, { status: 400 })
        }
        const result = await deleteGroupChat({ userId: user.id, groupId })
        if (result.ok) return new Response(null, { status: 204 })
        return Response.json(
          {
            error:
              result.reason === "forbidden"
                ? "Seul le propriétaire peut supprimer ce groupe."
                : "Groupe introuvable.",
          },
          { status: result.reason === "forbidden" ? 403 : 404 }
        )
      },
    },
  },
})
