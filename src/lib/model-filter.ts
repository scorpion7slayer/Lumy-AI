import type { ChatModel, ProviderId } from "@/lib/chat-types"

export type ProviderFilter = "all" | ProviderId
export type PriceFilter = "all" | "free"

export function filterModels(
  models: ChatModel[],
  {
    provider,
    price,
    query,
  }: { provider: ProviderFilter; price: PriceFilter; query: string }
) {
  const normalized = query.trim().toLocaleLowerCase("fr")
  return models.filter((model) => {
    if (provider !== "all" && model.provider !== provider) return false
    if (price === "free" && !model.isFree) return false
    if (!normalized) return true
    return `${model.name} ${model.owner} ${model.providerLabel}`
      .toLocaleLowerCase("fr")
      .includes(normalized)
  })
}
