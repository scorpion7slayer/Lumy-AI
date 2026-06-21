import { describe, expect, it } from "vitest"
import { providerIds, providerLabels } from "@/lib/providers"
import { getProviderConfig } from "@/lib/providers.server"

describe("providers", () => {
  it("expose les quatre fournisseurs dans un ordre stable", () => {
    expect(providerIds).toEqual(["openrouter", "kilo", "opencode", "nvidia"])
    expect(providerLabels).toEqual({
      openrouter: "OpenRouter",
      kilo: "Kilo Code",
      opencode: "OpenCode",
      nvidia: "NVIDIA NIM",
      lumy: "Lumy AI",
    })
  })

  it("utilise le catalogue complet et le chat compatible OpenAI d’OpenCode", () => {
    const config = getProviderConfig("opencode")
    expect(config.modelsEndpoint).toBe("https://opencode.ai/zen/v1/models")
    expect(config.chatEndpoint).toBe(
      "https://opencode.ai/zen/v1/chat/completions"
    )
  })

  it("utilise l’API hébergée OpenAI-compatible de NVIDIA NIM", () => {
    const config = getProviderConfig("nvidia")
    expect(config.modelsEndpoint).toBe(
      "https://integrate.api.nvidia.com/v1/models"
    )
    expect(config.chatEndpoint).toBe(
      "https://integrate.api.nvidia.com/v1/chat/completions"
    )
  })
})
