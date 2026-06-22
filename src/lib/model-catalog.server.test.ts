import { afterEach, describe, expect, it, vi } from "vitest"
import {
  clearModelCatalogCacheForTests,
  getModelCatalog,
  normalizeProviderModel,
} from "@/lib/model-catalog.server"

afterEach(() => {
  clearModelCatalogCacheForTests()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe("model catalog normalization", () => {
  it("marque les modèles de l’endpoint hébergé NVIDIA comme gratuits", () => {
    expect(
      normalizeProviderModel(
        { id: "meta/llama-3.3-70b-instruct", owned_by: "nvidia" },
        "nvidia"
      )
    ).toMatchObject({
      provider: "nvidia",
      isFree: true,
      inputPrice: 0,
      outputPrice: 0,
    })
  })

  it("reconnaît un tarif explicitement nul comme gratuit", () => {
    expect(
      normalizeProviderModel(
        {
          id: "vendor/free-model",
          pricing: { prompt: "0", completion: "0" },
        },
        "openrouter"
      )
    ).toMatchObject({ isFree: true })
  })

  it("reconnaît le marqueur gratuit camelCase de Kilo", () => {
    expect(
      normalizeProviderModel({ id: "vendor/kilo-free", isFree: true }, "kilo")
    ).toMatchObject({ isFree: true })
  })

  it("normalise les modalités déclarées ou déduites des modèles vision", () => {
    expect(
      normalizeProviderModel(
        {
          id: "vendor/declared-model",
          architecture: { input_modalities: ["text", "image"] },
        },
        "openrouter"
      )?.inputModalities
    ).toEqual(["text", "image"])
    expect(
      normalizeProviderModel({ id: "vendor/multimodal-instruct" }, "nvidia")
        ?.inputModalities
    ).toEqual(["text", "image"])
  })

  it("ajoute Lumy AI devant un catalogue contenant un modèle gratuit", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "test-key")
    vi.stubEnv("KILO_API_KEY", "")
    vi.stubEnv("OPENCODE_API_KEY", "")
    vi.stubEnv("NVIDIA_API_KEY", "")
    vi.stubEnv("NVIDIA_NIM_API_KEY", "")
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            data: [
              {
                id: "vendor/free-chat",
                pricing: { prompt: "0", completion: "0" },
              },
            ],
          }),
          { status: 200 }
        )
      )
    )

    const catalog = await getModelCatalog()
    expect(catalog.models.map((model) => model.id)).toEqual([
      "lumy/router",
      "lumy/free-router",
      "vendor/free-chat",
    ])
    expect(catalog.providers).toEqual(["lumy", "openrouter"])
  })

  it("charge NVIDIA NIM sans conserver ses endpoints non conversationnels", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "")
    vi.stubEnv("KILO_API_KEY", "")
    vi.stubEnv("OPENCODE_API_KEY", "")
    vi.stubEnv("NVIDIA_API_KEY", "test-key")
    vi.stubEnv("NVIDIA_NIM_API_KEY", "")
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            data: [
              { id: "meta/llama-3.3-70b-instruct" },
              { id: "meta/llama-3.2-90b-vision-instruct" },
              { id: "microsoft/phi-4-multimodal-instruct" },
              { id: "google/diffusiongemma-26b-a4b-it" },
              { id: "nvidia/ising-calibration-1-35b-a3b" },
              { id: "nvidia/nemotron-nano-12b-v2-vl" },
              { id: "nvidia/nv-embedqa-e5-v5" },
              { id: "nvidia/nemotron-3-content-safety" },
            ],
          }),
          { status: 200 }
        )
      )
    )

    const catalog = await getModelCatalog()
    expect(catalog.models.map((model) => model.id)).toEqual([
      "lumy/router",
      "lumy/free-router",
      "meta/llama-3.3-70b-instruct",
      "meta/llama-3.2-90b-vision-instruct",
      "microsoft/phi-4-multimodal-instruct",
      "google/diffusiongemma-26b-a4b-it",
      "nvidia/ising-calibration-1-35b-a3b",
      "nvidia/nemotron-nano-12b-v2-vl",
    ])
    expect(
      catalog.models
        .filter((model) => model.provider === "nvidia")
        .every((model) => model.isFree)
    ).toBe(true)
    expect(catalog.providers).toEqual(["lumy", "nvidia"])
  })
})
