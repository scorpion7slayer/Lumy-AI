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
  it("ne présente pas un modèle NVIDIA sans tarif connu comme gratuit", () => {
    expect(
      normalizeProviderModel(
        { id: "meta/llama-3.3-70b-instruct", owned_by: "nvidia" },
        "nvidia"
      )
    ).toMatchObject({
      provider: "nvidia",
      isFree: false,
      inputPrice: -1,
      outputPrice: -1,
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
              { id: "nvidia/nv-embedqa-e5-v5" },
              { id: "meta/llama-3.2-90b-vision-instruct" },
            ],
          }),
          { status: 200 }
        )
      )
    )

    const catalog = await getModelCatalog()
    expect(catalog.models.map((model) => model.id)).toEqual([
      "meta/llama-3.3-70b-instruct",
    ])
    expect(catalog.providers).toEqual(["nvidia"])
  })
})
