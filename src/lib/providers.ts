import type { ExternalProviderId, ProviderId } from "@/lib/chat-types"

export const providerIds = [
  "openrouter",
  "kilo",
  "opencode",
  "nvidia",
] as const satisfies readonly ExternalProviderId[]

export const providerLabels: Record<ProviderId, string> = {
  openrouter: "OpenRouter",
  kilo: "Kilo Code",
  opencode: "OpenCode",
  nvidia: "NVIDIA NIM",
  lumy: "Lumy AI",
}

export function isProviderId(value: unknown): value is ProviderId {
  return value === "lumy" || isExternalProviderId(value)
}

export function isExternalProviderId(
  value: unknown
): value is ExternalProviderId {
  return providerIds.some((provider) => provider === value)
}
