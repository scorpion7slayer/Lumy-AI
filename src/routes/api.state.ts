import { createFileRoute } from "@tanstack/react-router"
import type { PersistedChatState } from "@/lib/chat-types"
import { requireRequestUser } from "@/lib/auth.server"
import { readChatState, writeChatState } from "@/lib/db.server"

const MAX_STATE_BYTES = 5 * 1024 * 1024

function isPersistedChatState(value: unknown): value is PersistedChatState {
  if (!value || typeof value !== "object") return false
  const state = value as Partial<PersistedChatState>
  return (
    state.version === 2 &&
    Array.isArray(state.conversations) &&
    Array.isArray(state.memories) &&
    Array.isArray(state.files) &&
    (typeof state.activeConversationId === "string" ||
      state.activeConversationId === null) &&
    typeof state.selectedModel === "object" &&
    typeof state.reflection === "string"
  )
}

export const Route = createFileRoute("/api/state")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const user = await requireRequestUser(request)
        try {
          const saved = await readChatState(user.id)
          return Response.json({ enabled: true, ...saved })
        } catch (error) {
          console.error("[Lumy] Lecture MySQL impossible", error)
          return Response.json(
            { error: "Lecture MySQL impossible." },
            { status: 503 }
          )
        }
      },
      PUT: async ({ request }) => {
        const user = await requireRequestUser(request)

        const raw = await request.text()
        if (new TextEncoder().encode(raw).byteLength > MAX_STATE_BYTES) {
          return Response.json(
            { error: "État trop volumineux." },
            { status: 413 }
          )
        }

        let body: { state?: unknown }
        try {
          body = JSON.parse(raw) as { state?: unknown }
        } catch {
          return Response.json(
            { error: "Corps JSON invalide." },
            { status: 400 }
          )
        }

        if (!isPersistedChatState(body.state)) {
          return Response.json(
            { error: "État Lumy invalide." },
            { status: 400 }
          )
        }

        try {
          await writeChatState(user.id, body.state)
          return Response.json({ enabled: true, saved: true })
        } catch (error) {
          console.error("[Lumy] Écriture MySQL impossible", error)
          return Response.json(
            { error: "Écriture MySQL impossible." },
            { status: 503 }
          )
        }
      },
    },
  },
})
