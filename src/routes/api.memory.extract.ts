import { createFileRoute } from "@tanstack/react-router"
import type { ExternalProviderId, MemoryItem } from "@/lib/chat-types"
import { requireRequestUser } from "@/lib/auth.server"
import {
  availableFreeModelCandidates,
  recordFreeModelFailure,
} from "@/lib/free-router.server"
import { LUMY_FREE_ROUTER_ID } from "@/lib/free-router"
import { parseMemoryCandidates } from "@/lib/memory-candidates"
import { getModelCatalog } from "@/lib/model-catalog.server"
import {
  getProviderConfig,
  providerRequestHeaders,
} from "@/lib/providers.server"
import { isProviderId } from "@/lib/providers"

type RoutedMemoryModel = {
  id: string
  provider: ExternalProviderId
}

function responseText(value: unknown) {
  if (typeof value === "string") return value
  if (!Array.isArray(value)) return ""
  return value
    .map((part) =>
      part &&
      typeof part === "object" &&
      typeof (part as { text?: unknown }).text === "string"
        ? (part as { text: string }).text
        : ""
    )
    .join("")
}

export const Route = createFileRoute("/api/memory/extract")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        await requireRequestUser(request)
        const contentLength = Number(request.headers.get("content-length") ?? 0)
        if (contentLength > 100_000) {
          return Response.json({ memories: [] }, { status: 413 })
        }

        let body: {
          provider?: unknown
          model?: unknown
          userMessages?: unknown
          memories?: unknown
        }
        try {
          body = await request.json()
        } catch {
          return Response.json({ memories: [] }, { status: 400 })
        }
        if (
          !isProviderId(body.provider) ||
          typeof body.model !== "string" ||
          body.model.length > 250 ||
          (body.provider === "lumy" && body.model !== LUMY_FREE_ROUTER_ID) ||
          !Array.isArray(body.userMessages) ||
          !Array.isArray(body.memories)
        ) {
          return Response.json({ memories: [] }, { status: 400 })
        }

        const userMessages = body.userMessages
          .filter((message): message is string => typeof message === "string")
          .slice(-4)
          .map((message) => message.trim().slice(0, 4_000))
          .filter(Boolean)
        const memories = body.memories
          .filter(
            (memory): memory is MemoryItem =>
              Boolean(memory) &&
              typeof memory === "object" &&
              typeof (memory as MemoryItem).id === "string" &&
              typeof (memory as MemoryItem).title === "string" &&
              typeof (memory as MemoryItem).content === "string"
          )
          .slice(0, 100)
        if (!userMessages.length) return Response.json({ memories: [] })

        let routedModels: RoutedMemoryModel[]
        if (body.provider === "lumy") {
          const catalog = await getModelCatalog()
          routedModels = availableFreeModelCandidates(
            catalog.models,
            userMessages.join("\n")
          )
        } else {
          const providerConfig = getProviderConfig(body.provider)
          if (!providerConfig.apiKey)
            return Response.json({ memories: [] }, { status: 503 })
          routedModels = [{ id: body.model, provider: body.provider }]
        }
        if (!routedModels.length)
          return Response.json({ memories: [] }, { status: 503 })
        const existing = memories.map(({ id, title, content }) => ({
          id,
          title: title.slice(0, 80),
          content: content.slice(0, 500),
        }))
        const systemMessage = `Tu es le gestionnaire de mémoire privée de Lumy. Analyse uniquement les messages écrits par l’utilisateur et décide s’ils contiennent une information explicitement déclarée, personnelle et utile durablement dans de futures conversations.

À mémoriser : préférences de réponse, objectifs durables, projets suivis, contraintes récurrentes, habitudes utiles et faits personnels stables.
À ignorer : salutations, demandes ponctuelles, questions, contenu produit ou cité par l’assistant, informations trouvées sur le Web, suppositions, états temporaires et éléments déjà présents.
Ne mémorise jamais : mots de passe, clés API, jetons, coordonnées, données bancaires, secrets, données médicales ou informations intimes/sensibles.

Réponds exclusivement avec un objet JSON valide : {"memories":[{"title":"titre court","content":"fait autonome rédigé à la troisième personne","replacesId":"identifiant existant ou null"}]}. Retourne {"memories":[]} en cas de doute. Maximum 3 éléments. Pour corriger ou enrichir une mémoire existante, utilise son identifiant dans replacesId au lieu de créer un doublon.`

        let content = ""
        let attempts = 0
        const blockedProviders = new Set<ExternalProviderId>()
        for (const routedModel of routedModels) {
          if (attempts >= 5) break
          if (blockedProviders.has(routedModel.provider)) continue
          attempts += 1
          const providerConfig = getProviderConfig(routedModel.provider)
          try {
            const upstream = await fetch(providerConfig.chatEndpoint, {
              method: "POST",
              signal: AbortSignal.any([
                request.signal,
                AbortSignal.timeout(20_000),
              ]),
              headers: {
                Authorization: `Bearer ${providerConfig.apiKey}`,
                "Content-Type": "application/json",
                ...providerRequestHeaders(routedModel.provider),
              },
              body: JSON.stringify({
                model: routedModel.id,
                stream: false,
                temperature: 0,
                max_tokens: 500,
                messages: [
                  { role: "system", content: systemMessage },
                  {
                    role: "user",
                    content: JSON.stringify({
                      existingMemories: existing,
                      recentUserMessages: userMessages,
                    }),
                  },
                ],
              }),
            })
            if (!upstream.ok) {
              if (body.provider !== "lumy") break
              recordFreeModelFailure(
                routedModel,
                upstream.status,
                upstream.headers.get("retry-after")
              )
              if (upstream.status === 429)
                blockedProviders.add(routedModel.provider)
              continue
            }
            const payload = (await upstream.json().catch(() => null)) as {
              choices?: Array<{ message?: { content?: unknown } }>
            } | null
            content = responseText(payload?.choices?.[0]?.message?.content)
            if (content) break
          } catch {
            if (body.provider !== "lumy") break
            recordFreeModelFailure(routedModel, 502, null)
          }
        }
        if (!content) return Response.json({ memories: [] }, { status: 502 })
        const candidates = parseMemoryCandidates(
          content,
          new Set(memories.map((memory) => memory.id))
        )
        return Response.json({ memories: candidates })
      },
    },
  },
})
