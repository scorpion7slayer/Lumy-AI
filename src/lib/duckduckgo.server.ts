export type WebSearchResult = {
  title: string
  url: string
  snippet: string
}

const cache = new Map<
  string,
  { expiresAt: number; results: WebSearchResult[] }
>()

export function buildDuckDuckGoQuery(questions: string[]) {
  const normalized = questions
    .map((question) => question.trim())
    .filter(Boolean)
  const latest = normalized.at(-1)
  const previous = normalized.at(-2)
  if (!latest) return ""
  const needsContext =
    typeof previous === "string" &&
    latest.length < 160 &&
    /\b(ça|cela|ce|cet|cette|ces|le|la|les|l['’]|il|elle|qui|dessus|précédent)\b/i.test(
      latest
    )
  return (needsContext ? `${previous} ${latest}` : latest).slice(0, 500)
}

function decodeHtml(value: string) {
  const namedEntities: Record<string, string> = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    nbsp: " ",
    quot: '"',
  }
  return value.replace(
    /&(#x[\da-f]+|#\d+|amp|apos|gt|lt|nbsp|quot);/gi,
    (entity, code: string) => {
      if (code.startsWith("#x")) {
        return String.fromCodePoint(Number.parseInt(code.slice(2), 16))
      }
      if (code.startsWith("#")) {
        return String.fromCodePoint(Number.parseInt(code.slice(1), 10))
      }
      return namedEntities[code.toLowerCase()] ?? entity
    }
  )
}

function plainText(value: string) {
  return decodeHtml(value.replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim()
}

export function normalizeDuckDuckGoUrl(value: string) {
  const decoded = decodeHtml(value)
  const absolute = decoded.startsWith("//") ? `https:${decoded}` : decoded
  try {
    const url = new URL(absolute, "https://duckduckgo.com")
    if (url.hostname.endsWith("duckduckgo.com") && url.pathname === "/l/") {
      return url.searchParams.get("uddg") ?? absolute
    }
    return url.toString()
  } catch {
    return absolute
  }
}

export function parseDuckDuckGoHtml(html: string, limit = 5) {
  const links = Array.from(
    html.matchAll(
      /<a[^>]*class=["'][^"']*result__a[^"']*["'][^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi
    )
  )
  const snippets = Array.from(
    html.matchAll(
      /<(?:a|div)[^>]*class=["'][^"']*result__snippet[^"']*["'][^>]*>([\s\S]*?)<\/(?:a|div)>/gi
    )
  )

  return links
    .slice(0, limit)
    .map((link, index) => ({
      title: plainText(link[2]),
      url: normalizeDuckDuckGoUrl(link[1]),
      snippet: plainText(snippets[index]?.[1] ?? "").slice(0, 500),
    }))
    .filter((result) => result.title && /^https?:\/\//.test(result.url))
}

type InstantAnswerTopic = {
  FirstURL?: string
  Text?: string
  Topics?: InstantAnswerTopic[]
}

function flattenTopics(topics: InstantAnswerTopic[]): InstantAnswerTopic[] {
  return topics.flatMap((topic) =>
    topic.Topics?.length ? flattenTopics(topic.Topics) : [topic]
  )
}

async function fetchInstantAnswers(query: string) {
  const response = await fetch(
    `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`,
    { signal: AbortSignal.timeout(8_000) }
  )
  if (!response.ok) return []
  const payload = (await response.json()) as {
    AbstractText?: string
    AbstractURL?: string
    Heading?: string
    RelatedTopics?: InstantAnswerTopic[]
  }
  const results: WebSearchResult[] = []
  if (payload.AbstractText && payload.AbstractURL) {
    results.push({
      title: payload.Heading || query,
      url: payload.AbstractURL,
      snippet: payload.AbstractText.slice(0, 500),
    })
  }
  for (const topic of flattenTopics(payload.RelatedTopics ?? [])) {
    if (!topic.FirstURL || !topic.Text) continue
    results.push({
      title: topic.Text.split(" - ")[0].slice(0, 140),
      url: topic.FirstURL,
      snippet: topic.Text.slice(0, 500),
    })
    if (results.length >= 5) break
  }
  return results
}

export async function searchDuckDuckGo(query: string) {
  const normalizedQuery = query.trim().slice(0, 500)
  if (!normalizedQuery) return []
  const key = normalizedQuery.toLocaleLowerCase("fr")
  const cached = cache.get(key)
  if (cached && cached.expiresAt > Date.now()) return cached.results

  let results: WebSearchResult[] = []
  try {
    const response = await fetch(
      `https://html.duckduckgo.com/html/?q=${encodeURIComponent(normalizedQuery)}&kl=fr-fr&kp=1`,
      {
        headers: {
          Accept: "text/html,application/xhtml+xml",
          "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.7",
          "User-Agent":
            "Mozilla/5.0 (compatible; Lumy/1.0; +https://localhost)",
        },
        signal: AbortSignal.timeout(8_000),
      }
    )
    if (response.ok) results = parseDuckDuckGoHtml(await response.text())
  } catch {
    // The Instant Answer endpoint below remains available as a fallback.
  }

  if (!results.length) {
    try {
      results = await fetchInstantAnswers(normalizedQuery)
    } catch {
      results = []
    }
  }

  cache.set(key, { expiresAt: Date.now() + 5 * 60_000, results })
  return results
}
