import { randomUUID } from "node:crypto"
import { createFileRoute } from "@tanstack/react-router"
import { assertSameOrigin, requireRequestUser } from "@/lib/auth.server"
import {
  consumeRateLimit,
  insertGroupMessage,
  listGroupMessages,
} from "@/lib/db.server"
import { readLimitedJsonObject } from "@/lib/request-guards.server"

export const Route = createFileRoute("/api/group-messages")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const user = await requireRequestUser(request)
        const groupId =
          new URL(request.url).searchParams.get("groupId")?.trim() ?? ""
        if (!groupId)
          return Response.json({ error: "Groupe requis." }, { status: 400 })
        return Response.json({
          messages: await listGroupMessages(user.id, groupId),
        })
      },
      POST: async ({ request }) => {
        assertSameOrigin(request)
        const user = await requireRequestUser(request)
        const rate = await consumeRateLimit({
          scope: `group-message:${user.id}`,
          limit: 30,
          windowSeconds: 60,
        })
        if (!rate.allowed) {
          return Response.json(
            { error: "Vous envoyez trop de messages." },
            {
              status: 429,
              headers: { "Retry-After": String(rate.retryAfterSeconds) },
            }
          )
        }
        const body = await readLimitedJsonObject(request)
        const groupId =
          typeof body.groupId === "string" ? body.groupId.trim() : ""
        const content =
          typeof body.content === "string" ? body.content.trim() : ""
        if (!groupId || content.length < 1 || content.length > 10_000) {
          return Response.json({ error: "Message invalide." }, { status: 400 })
        }
        const inserted = await insertGroupMessage({
          id: randomUUID(),
          groupId,
          authorUserId: user.id,
          content,
        })
        return inserted
          ? Response.json({ sent: true }, { status: 201 })
          : Response.json(
              { error: "Vous ne participez pas à ce groupe." },
              { status: 403 }
            )
      },
    },
  },
})
