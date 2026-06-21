import { afterEach, describe, expect, it } from "vitest"
import type { ChatModel, ExternalProviderId } from "@/lib/chat-types"
import {
  availableFreeModelCandidates,
  recordFreeModelFailure,
  resetFreeRouterStateForTests,
} from "@/lib/free-router.server"
import {
  createLumyRouterModel,
  LUMY_FREE_ROUTER_ID,
  rankFreeModels,
} from "@/lib/free-router"
import { providerLabels } from "@/lib/providers"

function model(
  id: string,
  provider: ExternalProviderId,
  options: Partial<ChatModel> = {}
): ChatModel {
  return {
    id,
    name: id,
    provider,
    providerLabel: providerLabels[provider],
    owner: providerLabels[provider],
    contextWindow: 128_000,
    inputPrice: 0,
    outputPrice: 0,
    speed: 3,
    isFree: true,
    reasoningLevels: [],
    ...options,
  }
}

afterEach(resetFreeRouterStateForTests)

describe("Lumy free router", () => {
  const models = [
    model("vendor/general-instruct", "opencode"),
    model("vendor/backup-chat", "opencode"),
    model("vendor/qwen-coder-free", "openrouter"),
    model("vendor/reasoning-free", "kilo", {
      reasoningLevels: ["standard"],
    }),
  ]

  it("crée un modèle virtuel uniquement quand un modèle gratuit existe", () => {
    const lumy = createLumyRouterModel(models)
    expect(lumy).toMatchObject({
      id: LUMY_FREE_ROUTER_ID,
      provider: "lumy",
      isFree: true,
      recommended: true,
    })
    expect(
      createLumyRouterModel([
        model("paid", "nvidia", { isFree: false, inputPrice: -1 }),
      ])
    ).toBeNull()
  })

  it("préfère un modèle de code pour une demande de programmation", () => {
    expect(rankFreeModels(models, "Débogue ce code TypeScript")[0].id).toBe(
      "vendor/qwen-coder-free"
    )
  })

  it("change de fournisseur après une limite de débit", () => {
    const first = availableFreeModelCandidates(models, "Bonjour", 1_000)[0]
    recordFreeModelFailure(first, 429, "60", 1_000)
    const next = availableFreeModelCandidates(models, "Bonjour", 2_000)[0]
    expect(next.provider).not.toBe(first.provider)
  })

  it("change seulement de modèle après une erreur temporaire ordinaire", () => {
    const first = availableFreeModelCandidates(models, "Bonjour", 1_000)[0]
    recordFreeModelFailure(first, 503, null, 1_000)
    const remaining = availableFreeModelCandidates(models, "Bonjour", 2_000)
    expect(remaining.some((item) => item.id === first.id)).toBe(false)
    expect(remaining.some((item) => item.provider === first.provider)).toBe(
      true
    )
  })
})
