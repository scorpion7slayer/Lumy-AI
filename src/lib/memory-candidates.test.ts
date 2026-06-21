import { describe, expect, it } from "vitest"
import { parseMemoryCandidates } from "@/lib/memory-candidates"

describe("memory candidate validation", () => {
  it("accepts durable memories and valid replacements", () => {
    const result = parseMemoryCandidates(
      '```json\n{"memories":[{"title":"Projet principal","content":"L’utilisateur développe une application appelée Lumy.","replacesId":"project"}]}\n```',
      new Set(["project"])
    )
    expect(result).toEqual([
      {
        title: "Projet principal",
        content: "L’utilisateur développe une application appelée Lumy.",
        replacesId: "project",
      },
    ])
  })

  it("rejects credentials and contact details", () => {
    const result = parseMemoryCandidates(
      JSON.stringify({
        memories: [
          { title: "Clé API", content: "La clé API est sk-test-secret." },
          {
            title: "Contact",
            content: "L’adresse est test@example.com.",
          },
        ],
      }),
      new Set()
    )
    expect(result).toEqual([])
  })
})
