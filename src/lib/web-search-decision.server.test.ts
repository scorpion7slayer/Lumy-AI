import { describe, expect, it } from "vitest"
import { fastWebSearchDecision } from "@/lib/web-search-decision.server"

describe("fast web search decision", () => {
  it("searches for explicit or current information", () => {
    expect(
      fastWebSearchDecision(
        "Recherche sur Internet le prix actuel du Bitcoin",
        "prix actuel Bitcoin"
      )
    ).toMatchObject({ search: true })
    expect(
      fastWebSearchDecision("Quelle est la météo aujourd’hui ?", "météo")
    ).toMatchObject({ search: true })
  })

  it("does not search for casual conversation or memory questions", () => {
    expect(fastWebSearchDecision("Salut !", "Salut")).toMatchObject({
      search: false,
    })
    expect(
      fastWebSearchDecision("Que sais-tu de moi grâce à ma mémoire ?", "")
    ).toMatchObject({ search: false })
  })

  it("delegates genuinely ambiguous questions to the model", () => {
    expect(
      fastWebSearchDecision(
        "Comment fonctionne un compilateur ?",
        "compilateur"
      )
    ).toBeNull()
  })
})
