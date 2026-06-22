import { createFileRoute } from "@tanstack/react-router"
import { assertSameOrigin, requireRequestUser } from "@/lib/auth.server"
import {
  addConversationReference,
  listConversationReferences,
  removeConversationReference,
} from "@/lib/db.server"
import { readLimitedJsonObject } from "@/lib/request-guards.server"

function validConversationId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(value)
}

export const Route = createFileRoute("/api/conversation-references")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const user = await requireRequestUser(request)
        const conversationId = new URL(request.url).searchParams.get(
          "conversationId"
        )
        if (!validConversationId(conversationId)) {
          return Response.json(
            { error: "Conversation invalide." },
            { status: 400 }
          )
        }
        return Response.json({
          references: await listConversationReferences(user.id, conversationId),
        })
      },
      POST: async ({ request }) => {
        assertSameOrigin(request)
        const user = await requireRequestUser(request)
        const body = await readLimitedJsonObject(request)
        if (
          !validConversationId(body.conversationId) ||
          !validConversationId(body.referencedConversationId)
        ) {
          return Response.json(
            { error: "Conversation invalide." },
            { status: 400 }
          )
        }
        const result = await addConversationReference({
          userId: user.id,
          conversationId: body.conversationId,
          referencedConversationId: body.referencedConversationId,
        })
        return result.ok
          ? Response.json(result, { status: 201 })
          : Response.json(
              {
                error:
                  result.reason === "same_conversation"
                    ? "Une conversation ne peut pas se référencer elle-même."
                    : "Conversation introuvable.",
              },
              { status: result.reason === "same_conversation" ? 400 : 404 }
            )
      },
      DELETE: async ({ request }) => {
        assertSameOrigin(request)
        const user = await requireRequestUser(request)
        const id = new URL(request.url).searchParams.get("id")?.trim() ?? ""
        const deleted = id
          ? await removeConversationReference(user.id, id)
          : false
        return deleted
          ? new Response(null, { status: 204 })
          : Response.json({ error: "Référence introuvable." }, { status: 404 })
      },
    },
  },
})
