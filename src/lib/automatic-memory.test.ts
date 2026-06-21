import { describe, expect, it } from "vitest"
import type { MemoryItem } from "@/lib/chat-types"
import { mergeAutomaticMemories } from "@/lib/automatic-memory"

const existing: MemoryItem = {
  id: "format",
  title: "Format préféré",
  content: "L’utilisateur préfère des réponses courtes.",
  updatedAt: "2026-06-20T00:00:00.000Z",
  enabled: true,
  source: "automatic",
}

describe("automatic memory merge", () => {
  it("adds a durable memory and marks its origin", () => {
    const result = mergeAutomaticMemories(
      [],
      [{ title: "Projet", content: "L’utilisateur construit Lumy." }],
      () => "new-memory",
      "2026-06-20T10:00:00.000Z"
    )
    expect(result).toMatchObject({ added: 1, updated: 0 })
    expect(result.memories[0]).toMatchObject({
      id: "new-memory",
      enabled: true,
      source: "automatic",
    })
  })

  it("updates an existing memory selected by the model", () => {
    const result = mergeAutomaticMemories(
      [existing],
      [
        {
          title: "Format préféré",
          content: "L’utilisateur préfère des réponses très détaillées.",
          replacesId: "format",
        },
      ]
    )
    expect(result).toMatchObject({ added: 0, updated: 1 })
    expect(result.memories[0].content).toContain("très détaillées")
  })

  it("does not create a duplicate memory", () => {
    const result = mergeAutomaticMemories(
      [existing],
      [
        {
          title: "Réponses",
          content: "L'utilisateur préfère des réponses courtes.",
        },
      ]
    )
    expect(result).toMatchObject({ added: 0, updated: 0 })
    expect(result.memories).toHaveLength(1)
  })
})
