import type { AutomaticMemoryCandidate, MemoryItem } from "@/lib/chat-types"

function normalizedMemoryText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("fr")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}

export function mergeAutomaticMemories(
  existing: MemoryItem[],
  candidates: AutomaticMemoryCandidate[],
  createId: () => string = () => crypto.randomUUID(),
  updatedAt = new Date().toISOString()
) {
  const memories = [...existing]
  let added = 0
  let updated = 0

  for (const candidate of candidates.slice(0, 3)) {
    const title = candidate.title.trim().slice(0, 80)
    const content = candidate.content.trim().slice(0, 500)
    if (!title || !content) continue
    const normalizedTitle = normalizedMemoryText(title)
    const normalizedContent = normalizedMemoryText(content)
    if (!normalizedTitle || !normalizedContent) continue

    const replacementIndex = candidate.replacesId
      ? memories.findIndex((memory) => memory.id === candidate.replacesId)
      : memories.findIndex(
          (memory) =>
            memory.source === "automatic" &&
            normalizedMemoryText(memory.title) === normalizedTitle
        )
    if (replacementIndex >= 0) {
      const previous = memories[replacementIndex]
      if (normalizedMemoryText(previous.content) === normalizedContent) continue
      memories[replacementIndex] = {
        ...previous,
        title,
        content,
        updatedAt,
      }
      updated += 1
      continue
    }

    const duplicate = memories.some((memory) => {
      const currentContent = normalizedMemoryText(memory.content)
      return (
        currentContent === normalizedContent ||
        (currentContent.length > 24 &&
          normalizedContent.includes(currentContent)) ||
        (normalizedContent.length > 24 &&
          currentContent.includes(normalizedContent))
      )
    })
    if (duplicate || memories.length >= 100) continue
    memories.push({
      id: createId(),
      title,
      content,
      updatedAt,
      enabled: true,
      source: "automatic",
    })
    added += 1
  }

  return { memories, added, updated }
}
