import type { ChatModel, ExternalProviderId } from "@/lib/chat-types"
import { rankModels } from "@/lib/free-router"

const modelCooldowns = new Map<string, number>()
const providerCooldowns = new Map<ExternalProviderId, number>()

type RoutableModel = Pick<ChatModel, "id" | "provider"> & {
  provider: ExternalProviderId
  contextWindow?: number
}

function modelKey(model: RoutableModel) {
  return `${model.provider}:${model.id}`
}

function retryAfterMilliseconds(value: string | null, now: number) {
  if (!value) return 0
  const seconds = Number(value)
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1_000)
  const date = Date.parse(value)
  return Number.isFinite(date) ? Math.max(0, date - now) : 0
}

function pruneExpired(now: number) {
  for (const [key, expiresAt] of modelCooldowns) {
    if (expiresAt <= now) modelCooldowns.delete(key)
  }
  for (const [key, expiresAt] of providerCooldowns) {
    if (expiresAt <= now) providerCooldowns.delete(key)
  }
}

export function availableModelCandidates(
  models: ChatModel[],
  prompt: string,
  {
    freeOnly,
    requiredContextTokens = 0,
    requiresImage = false,
    now = Date.now(),
  }: {
    freeOnly: boolean
    requiredContextTokens?: number
    requiresImage?: boolean
    now?: number
  }
) {
  pruneExpired(now)
  return rankModels(models, prompt, requiredContextTokens, freeOnly).filter(
    (model) =>
      (!requiresImage || model.inputModalities?.includes("image")) &&
      !modelCooldowns.has(modelKey(model)) &&
      !providerCooldowns.has(model.provider)
  )
}

export function recordModelFailure(
  model: RoutableModel,
  status: number,
  retryAfter: string | null,
  now = Date.now()
) {
  const requestedCooldown = retryAfterMilliseconds(retryAfter, now)
  const cooldown = Math.min(
    10 * 60_000,
    Math.max(requestedCooldown, status === 429 ? 60_000 : 15_000)
  )
  modelCooldowns.set(modelKey(model), now + cooldown)
  if (status === 429) {
    providerCooldowns.set(model.provider, now + cooldown)
  }
}

export function resetFreeRouterStateForTests() {
  modelCooldowns.clear()
  providerCooldowns.clear()
}
