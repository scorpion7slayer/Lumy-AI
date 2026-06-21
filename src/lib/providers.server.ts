import type { ExternalProviderId } from "@/lib/chat-types"
import { providerIds, providerLabels } from "@/lib/providers"

export type ProviderConfig = {
  id: ExternalProviderId
  label: string
  apiKey: string
  modelsEndpoint: string
  chatEndpoint: string
}

export function providerLabel(provider: ExternalProviderId) {
  return providerLabels[provider]
}

export function getProviderConfig(
  provider: ExternalProviderId
): ProviderConfig {
  if (provider === "openrouter") {
    return {
      id: provider,
      label: providerLabel(provider),
      apiKey: process.env.OPENROUTER_API_KEY?.trim() ?? "",
      modelsEndpoint:
        "https://openrouter.ai/api/v1/models?output_modalities=text",
      chatEndpoint: "https://openrouter.ai/api/v1/chat/completions",
    }
  }
  if (provider === "kilo") {
    return {
      id: provider,
      label: providerLabel(provider),
      apiKey: process.env.KILO_API_KEY?.trim() ?? "",
      modelsEndpoint: "https://api.kilo.ai/api/gateway/models",
      chatEndpoint: "https://api.kilo.ai/api/gateway/chat/completions",
    }
  }
  if (provider === "opencode") {
    return {
      id: provider,
      label: providerLabel(provider),
      apiKey: process.env.OPENCODE_API_KEY?.trim() ?? "",
      modelsEndpoint: "https://opencode.ai/zen/v1/models",
      chatEndpoint: "https://opencode.ai/zen/v1/chat/completions",
    }
  }
  return {
    id: provider,
    label: providerLabel(provider),
    apiKey:
      process.env.NVIDIA_API_KEY?.trim() ||
      process.env.NVIDIA_NIM_API_KEY?.trim() ||
      "",
    modelsEndpoint: "https://integrate.api.nvidia.com/v1/models",
    chatEndpoint: "https://integrate.api.nvidia.com/v1/chat/completions",
  }
}

export function configuredProviderConfigs() {
  return providerIds
    .map(getProviderConfig)
    .filter((provider) => provider.apiKey)
}

export function providerRequestHeaders(
  provider: ExternalProviderId
): Record<string, string> {
  if (provider !== "openrouter") return {}
  return {
    "HTTP-Referer": process.env.OPENROUTER_SITE_URL ?? "http://localhost:3000",
    "X-OpenRouter-Title": process.env.OPENROUTER_APP_NAME ?? "Lumy",
  }
}
