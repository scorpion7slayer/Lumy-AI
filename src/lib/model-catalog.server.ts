import type {
  ChatModel,
  ExternalProviderId,
  ProviderId,
} from "@/lib/chat-types"
import type { ModelCapabilitiesInput } from "@/lib/model-capabilities"
import { createLumyRouterModels } from "@/lib/free-router"
import { producesText, reasoningLevelsForModel } from "@/lib/model-capabilities"
import {
  configuredProviderConfigs,
  providerLabel,
} from "@/lib/providers.server"

type RawModel = ModelCapabilitiesInput & {
  id?: string
  name?: string
  context_length?: number
  top_provider?: { context_length?: number }
  owned_by?: string
  pricing?: { prompt?: string | number; completion?: string | number }
  is_free?: boolean
  isFree?: boolean
  free?: boolean
}

export type ModelCatalog = {
  models: ChatModel[]
  providers: ProviderId[]
  configuredProviders: ExternalProviderId[]
  cached: boolean
}

let cache: {
  expiresAt: number
  signature: string
  models: ChatModel[]
  providers: ProviderId[]
} | null = null

function toPricePerMillion(value?: string | number) {
  if (value === undefined || value === "") return -1
  const price = Number(value)
  if (!Number.isFinite(price)) return -1
  return price < 0 ? -1 : price * 1_000_000
}

function inputModalitiesForModel(raw: RawModel) {
  const declared = raw.architecture?.input_modalities
    ?.map((value) => value.toLocaleLowerCase("en"))
    .filter(Boolean)
  if (declared?.length) return Array.from(new Set(declared))

  const modality = raw.architecture?.modality?.split("->").at(0)
  if (modality) {
    const parsed = modality
      .split(/[+,/]/)
      .map((value) => value.trim().toLocaleLowerCase("en"))
      .filter(Boolean)
    if (parsed.length) return Array.from(new Set(parsed))
  }

  return /(?:vision|multimodal|omni|(?:^|[/_.-])vl(?:$|[/_.-]))/i.test(
    `${raw.id ?? ""} ${raw.name ?? ""}`
  )
    ? ["text", "image"]
    : ["text"]
}

export function normalizeProviderModel(
  raw: RawModel,
  provider: ExternalProviderId
): ChatModel | null {
  if (!raw.id) return null
  const isNvidiaFreeEndpoint = provider === "nvidia"
  const inputPrice = isNvidiaFreeEndpoint
    ? 0
    : toPricePerMillion(raw.pricing?.prompt)
  const outputPrice = isNvidiaFreeEndpoint
    ? 0
    : toPricePerMillion(raw.pricing?.completion)
  const owner = (raw.owned_by ?? raw.id.split("/")[0]) || "IA"
  return {
    id: raw.id,
    name: (
      raw.name ??
      raw.id.split("/").pop()?.replaceAll("-", " ") ??
      raw.id
    ).replace(/^[^:]{2,24}:\s*/, ""),
    provider,
    providerLabel: providerLabel(provider),
    owner: owner.charAt(0).toUpperCase() + owner.slice(1),
    contextWindow:
      raw.context_length ?? raw.top_provider?.context_length ?? 128_000,
    inputPrice,
    outputPrice,
    isFree:
      isNvidiaFreeEndpoint ||
      raw.is_free === true ||
      raw.isFree === true ||
      raw.free === true ||
      (inputPrice === 0 && outputPrice === 0) ||
      /(?:^|[-/: ])free(?:$|[-/: ])/i.test(`${raw.id} ${raw.name ?? ""}`),
    speed: inputPrice < 0 ? 3 : inputPrice < 0.5 ? 4 : inputPrice < 3 ? 3 : 2,
    reasoningLevels: reasoningLevelsForModel(raw),
    inputModalities: inputModalitiesForModel(raw),
  }
}

async function fetchProviderModels(
  url: string,
  provider: ExternalProviderId,
  apiKey: string
) {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(8_000),
  })
  if (!response.ok) throw new Error(`${provider}:${response.status}`)
  const payload = (await response.json()) as
    | RawModel[]
    | { data?: RawModel[]; models?: RawModel[] }
  const rawModels = Array.isArray(payload)
    ? payload
    : Array.isArray(payload.data)
      ? payload.data
      : Array.isArray(payload.models)
        ? payload.models
        : []
  return rawModels
    .filter(producesText)
    .map((model) => normalizeProviderModel(model, provider))
    .filter((model): model is ChatModel => Boolean(model))
}

export async function getModelCatalog(): Promise<ModelCatalog> {
  const providerConfig = configuredProviderConfigs()
  const signature = providerConfig.map((provider) => provider.id).join(",")

  if (cache && cache.expiresAt > Date.now() && cache.signature === signature) {
    return {
      models: cache.models,
      providers: cache.providers,
      configuredProviders: providerConfig.map((provider) => provider.id),
      cached: true,
    }
  }

  if (!providerConfig.length) {
    return {
      models: [],
      providers: [],
      configuredProviders: [],
      cached: false,
    }
  }

  const results = await Promise.allSettled(
    providerConfig.map((provider) =>
      fetchProviderModels(provider.modelsEndpoint, provider.id, provider.apiKey)
    )
  )
  const liveModels = results.flatMap((result) =>
    result.status === "fulfilled" ? result.value : []
  )
  const merged = new Map<string, ChatModel>()
  for (const model of liveModels) {
    merged.set(`${model.provider}:${model.id}`, model)
  }
  const providerModels = Array.from(merged.values())
  const lumyModels = createLumyRouterModels(providerModels)
  const models = [...lumyModels, ...providerModels]
  const providers: ProviderId[] = [
    ...(lumyModels.length ? (["lumy"] as const) : []),
    ...providerConfig
      .filter((provider) =>
        providerModels.some((model) => model.provider === provider.id)
      )
      .map((provider) => provider.id),
  ]
  cache = {
    models,
    providers,
    signature,
    expiresAt: Date.now() + 10 * 60_000,
  }
  return {
    models,
    providers,
    configuredProviders: providerConfig.map((provider) => provider.id),
    cached: false,
  }
}

export function clearModelCatalogCacheForTests() {
  cache = null
}
