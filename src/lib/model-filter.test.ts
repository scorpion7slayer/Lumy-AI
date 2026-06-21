import { describe, expect, it } from "vitest"
import type { ChatModel, ProviderId } from "@/lib/chat-types"
import { filterModels } from "@/lib/model-filter"
import { providerLabels } from "@/lib/providers"

function model(id: string, provider: ProviderId, isFree = false): ChatModel {
  return {
    id,
    name: id,
    provider,
    providerLabel: providerLabels[provider],
    owner: providerLabels[provider],
    contextWindow: 128_000,
    inputPrice: isFree ? 0 : 1,
    outputPrice: isFree ? 0 : 1,
    speed: 3,
    isFree,
    reasoningLevels: [],
  }
}

describe("filterModels", () => {
  const models = [
    model("openrouter-model", "openrouter"),
    model("kilo-free", "kilo", true),
    model("opencode-model", "opencode"),
  ]

  it("affiche les modèles de tous les fournisseurs par défaut", () => {
    expect(
      filterModels(models, { provider: "all", price: "all", query: "" })
    ).toHaveLength(3)
  })

  it("combine le fournisseur et le tarif sans confondre les deux filtres", () => {
    expect(
      filterModels(models, { provider: "kilo", price: "free", query: "" })
    ).toEqual([models[1]])
    expect(
      filterModels(models, {
        provider: "opencode",
        price: "free",
        query: "",
      })
    ).toEqual([])
  })

  it("ne tronque pas les catalogues de plus de cent modèles", () => {
    const largeCatalog = Array.from({ length: 140 }, (_, index) =>
      model(`model-${index}`, "openrouter")
    )
    expect(
      filterModels(largeCatalog, {
        provider: "all",
        price: "all",
        query: "",
      })
    ).toHaveLength(140)
  })
})
