import { afterEach, describe, expect, it } from "vitest"
import type { ChatModel, ExternalProviderId } from "@/lib/chat-types"
import {
  availableModelCandidates,
  recordModelFailure,
  resetFreeRouterStateForTests,
} from "@/lib/free-router.server"
import {
  createLumyRouterModels,
  LUMY_FREE_ROUTER_ID,
  LUMY_ROUTER_ID,
  rankModels,
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

describe("Lumy routers", () => {
  const models = [
    model("vendor/general-instruct", "opencode"),
    model("vendor/backup-chat", "opencode"),
    model("vendor/qwen-coder-free", "openrouter"),
    model("vendor/reasoning-free", "kilo", {
      reasoningLevels: ["standard"],
    }),
  ]

  it("crée Lumy AI pour tous les modèles et Lumy AI Free pour les gratuits", () => {
    const routers = createLumyRouterModels([
      ...models,
      model("vendor/premium", "nvidia", {
        isFree: false,
        inputPrice: 1,
        outputPrice: 2,
      }),
    ])
    expect(routers).toHaveLength(2)
    expect(routers[0]).toMatchObject({
      id: LUMY_ROUTER_ID,
      name: "Lumy AI",
      provider: "lumy",
      isFree: false,
      recommended: true,
    })
    expect(routers[1]).toMatchObject({
      id: LUMY_FREE_ROUTER_ID,
      name: "Lumy AI Free",
      provider: "lumy",
      isFree: true,
      recommended: false,
    })
  })

  it("conserve Lumy AI quand aucun modèle gratuit n’existe", () => {
    expect(
      createLumyRouterModels([
        model("paid", "nvidia", { isFree: false, inputPrice: 1 }),
      ]).map((router) => router.id)
    ).toEqual([LUMY_ROUTER_ID])
  })

  it("annonce la plus grande fenêtre disponible pour chaque routeur", () => {
    const routers = createLumyRouterModels([
      model("small", "opencode", { contextWindow: 32_000 }),
      model("large", "openrouter", { contextWindow: 200_000 }),
      model("premium-large", "nvidia", {
        contextWindow: 1_000_000,
        isFree: false,
      }),
    ])

    expect(
      routers.find((router) => router.id === LUMY_ROUTER_ID)?.contextWindow
    ).toBe(1_000_000)
    expect(
      routers.find((router) => router.id === LUMY_FREE_ROUTER_ID)?.contextWindow
    ).toBe(200_000)
  })

  it("préfère un modèle de code pour une demande de programmation", () => {
    expect(rankFreeModels(models, "Débogue ce code TypeScript")[0].id).toBe(
      "vendor/qwen-coder-free"
    )
  })

  it("écarte les modèles trop petits quand le contexte exige davantage", () => {
    const candidates = [
      model("vendor/fast-chat", "opencode", {
        contextWindow: 32_000,
        speed: 4,
        recommended: true,
      }),
      model("vendor/large-chat", "openrouter", {
        contextWindow: 200_000,
        speed: 2,
      }),
    ]

    expect(rankFreeModels(candidates, "Continue", 80_000)).toHaveLength(1)
    expect(rankFreeModels(candidates, "Continue", 80_000)[0].id).toBe(
      "vendor/large-chat"
    )
  })

  it("réserve les requêtes avec image aux modèles multimodaux", () => {
    const candidates = [
      model("vendor/text-chat", "opencode", {
        inputModalities: ["text"],
      }),
      model("vendor/vision-chat", "openrouter", {
        inputModalities: ["text", "image"],
      }),
    ]

    expect(
      availableModelCandidates(candidates, "Décris cette image", {
        freeOnly: true,
        requiresImage: true,
      }).map((candidate) => candidate.id)
    ).toEqual(["vendor/vision-chat"])
  })

  it("réserve le routeur gratuit aux modèles gratuits", () => {
    const candidates = [
      model("free", "opencode"),
      model("premium", "openrouter", {
        isFree: false,
        inputPrice: 1,
        recommended: true,
      }),
    ]
    expect(
      rankFreeModels(candidates, "Bonjour").map((item) => item.id)
    ).toEqual(["free"])
    expect(rankModels(candidates, "Bonjour").map((item) => item.id)).toContain(
      "premium"
    )
  })

  it("change de fournisseur après une limite de débit", () => {
    const first = availableModelCandidates(models, "Bonjour", {
      freeOnly: true,
      now: 1_000,
    })[0]
    recordModelFailure(first, 429, "60", 1_000)
    const next = availableModelCandidates(models, "Bonjour", {
      freeOnly: true,
      now: 2_000,
    })[0]
    expect(next.provider).not.toBe(first.provider)
  })

  it("change seulement de modèle après une erreur temporaire ordinaire", () => {
    const first = availableModelCandidates(models, "Bonjour", {
      freeOnly: true,
      now: 1_000,
    })[0]
    recordModelFailure(first, 503, null, 1_000)
    const remaining = availableModelCandidates(models, "Bonjour", {
      freeOnly: true,
      now: 2_000,
    })
    expect(remaining.some((item) => item.id === first.id)).toBe(false)
    expect(remaining.some((item) => item.provider === first.provider)).toBe(
      true
    )
  })
})
