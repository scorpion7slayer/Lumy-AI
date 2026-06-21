import type { AutomaticMemoryCandidate } from "@/lib/chat-types"

const sensitiveMemoryPattern =
  /(api[_ -]?key|clé api|mot de passe|password|passphrase|token|jeton d['’]accès|secret|private key|clé privée|carte bancaire|credit card|cvv|iban|numéro de sécurité sociale|diagnostic|dossier médical|orientation sexuelle)/i
const emailPattern = /\b[\w.+-]+@[\w.-]+\.[a-z]{2,}\b/i
const longSecretPattern = /\b[A-Za-z0-9_-]{32,}\b/

export function parseMemoryCandidates(
  content: string,
  existingIds: Set<string>
): AutomaticMemoryCandidate[] {
  const unfenced = content
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim()
  const start = unfenced.indexOf("{")
  const end = unfenced.lastIndexOf("}")
  if (start < 0 || end <= start) return []

  let value: unknown
  try {
    value = JSON.parse(unfenced.slice(start, end + 1))
  } catch {
    return []
  }
  if (!value || typeof value !== "object") return []
  const memories = (value as { memories?: unknown }).memories
  if (!Array.isArray(memories)) return []

  return memories.slice(0, 3).flatMap((item) => {
    if (!item || typeof item !== "object") return []
    const candidate = item as {
      title?: unknown
      content?: unknown
      replacesId?: unknown
    }
    if (
      typeof candidate.title !== "string" ||
      typeof candidate.content !== "string"
    )
      return []
    const title = candidate.title.trim().slice(0, 80)
    const memoryContent = candidate.content.trim().slice(0, 500)
    if (
      title.length < 3 ||
      memoryContent.length < 8 ||
      sensitiveMemoryPattern.test(`${title} ${memoryContent}`) ||
      emailPattern.test(memoryContent) ||
      longSecretPattern.test(memoryContent)
    )
      return []
    const replacesId =
      typeof candidate.replacesId === "string" &&
      existingIds.has(candidate.replacesId)
        ? candidate.replacesId
        : undefined
    return [{ title, content: memoryContent, replacesId }]
  })
}
