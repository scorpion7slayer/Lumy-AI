import type { ExternalProviderId } from "@/lib/chat-types"
import { providerRequestHeaders } from "@/lib/providers.server"

export type WebSearchDecision = {
  search: boolean
  query: string
  source: "rule" | "model" | "fallback"
}

export function fastWebSearchDecision(
  latestQuestion: string,
  defaultQuery: string
): WebSearchDecision | null {
  const question = latestQuestion.trim()
  if (!question) return { search: false, query: "", source: "rule" }

  const explicitlyNeedsWeb =
    /\b(recherche|cherche|vérifie|regarde)\b.*\b(web|internet|en ligne|source|site|actualité)/i.test(
      question
    ) ||
    /\b(aujourd['’]hui|maintenant|actuellement|récent|dernière version|dernières nouvelles|actualité|météo|prix actuel|horaire|score|résultat du match|cours de|taux de change)\b/i.test(
      question
    )
  if (explicitlyNeedsWeb) {
    return { search: true, query: defaultQuery, source: "rule" }
  }

  const clearlyDoesNotNeedWeb =
    /^(salut|bonjour|bonsoir|merci|coucou|ça va|comment vas-tu)[\s!?.]*$/i.test(
      question
    ) ||
    /^(traduis|reformule|corrige|résume|rédige|écris|imagine|invente)\b/i.test(
      question
    ) ||
    /^(calcule|résous|combien font)\b/i.test(question) ||
    /\b(ma mémoire|mes mémoires|souviens-toi|rappelle-moi|sais de moi)\b/i.test(
      question
    )
  if (clearlyDoesNotNeedWeb) {
    return { search: false, query: "", source: "rule" }
  }
  return null
}

function parseDecision(content: string, defaultQuery: string) {
  const start = content.indexOf("{")
  const end = content.lastIndexOf("}")
  if (start < 0 || end <= start) return null
  try {
    const value = JSON.parse(content.slice(start, end + 1)) as {
      search?: unknown
      query?: unknown
    }
    if (typeof value.search !== "boolean") return null
    const query =
      typeof value.query === "string" && value.query.trim()
        ? value.query.trim().slice(0, 500)
        : defaultQuery
    return { search: value.search, query, source: "model" as const }
  } catch {
    return null
  }
}

export async function decideWebSearch({
  provider,
  model,
  apiKey,
  endpoint,
  latestQuestion,
  defaultQuery,
  signal,
}: {
  provider: ExternalProviderId
  model: string
  apiKey: string
  endpoint: string
  latestQuestion: string
  defaultQuery: string
  signal: AbortSignal
}): Promise<WebSearchDecision> {
  const fastDecision = fastWebSearchDecision(latestQuestion, defaultQuery)
  if (fastDecision) return fastDecision

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      signal: AbortSignal.any([signal, AbortSignal.timeout(7_000)]),
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        ...providerRequestHeaders(provider),
      },
      body: JSON.stringify({
        model,
        stream: false,
        temperature: 0,
        max_tokens: 100,
        messages: [
          {
            role: "system",
            content:
              'Décide si répondre correctement exige une recherche Internet. Recherche uniquement pour une demande explicite de recherche ou de sources, une information actuelle/instable, un prix, une disponibilité, une recommandation actuelle, une actualité ou une vérification factuelle récente. Ne recherche pas pour une conversation, une rédaction, une traduction, un calcul, une question stable, du code générique ou une demande fondée sur la mémoire fournie. Réponds exclusivement en JSON : {"search":true|false,"query":"requête courte si nécessaire"}.',
          },
          {
            role: "user",
            content: latestQuestion.slice(0, 2_000),
          },
        ],
      }),
    })
    if (!response.ok) throw new Error("classification unavailable")
    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: unknown } }>
    }
    const content = payload.choices?.[0]?.message?.content
    const parsed = parseDecision(
      typeof content === "string" ? content : "",
      defaultQuery
    )
    return parsed ?? { search: false, query: "", source: "fallback" }
  } catch {
    return { search: false, query: "", source: "fallback" }
  }
}
