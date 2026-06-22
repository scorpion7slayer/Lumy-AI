import type { ChatModel, ExternalProviderId } from "@/lib/chat-types"

export const LUMY_ROUTER_ID = "lumy/router"
export const LUMY_FREE_ROUTER_ID = "lumy/free-router"

const CODE_REQUEST =
  /\b(code|coder|codage|programme|programmer|développe|debug|bug|typescript|javascript|python|java|php|react|html|css|sql|api|terminal|fonction|classe|algorithme)\b/i
const REASONING_REQUEST =
  /\b(analyse|raisonne|réflexion|compare|démontre|preuve|math|logique|stratégie|plan détaillé|étape par étape|pourquoi)\b/i
const LONG_CONTEXT_REQUEST =
  /\b(long document|document complet|fichier complet|tout le code|tout le projet|longue conversation|beaucoup de contexte|rapport complet)\b/i

function isExternalModel(
  model: ChatModel
): model is ChatModel & { provider: ExternalProviderId } {
  return model.provider !== "lumy"
}

export function isLumyRouterId(value: string) {
  return value === LUMY_ROUTER_ID || value === LUMY_FREE_ROUTER_ID
}

export function isFreeLumyRouter(value: string) {
  return value === LUMY_FREE_ROUTER_ID
}

function stableTieBreaker(value: string) {
  let hash = 0
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) | 0
  }
  return Math.abs(hash % 1_000) / 1_000
}

export function freeModels(models: ChatModel[]) {
  return models.filter(
    (model): model is ChatModel & { provider: ExternalProviderId } =>
      isExternalModel(model) && model.isFree
  )
}

export function externalModels(models: ChatModel[]) {
  return models.filter(
    (model): model is ChatModel & { provider: ExternalProviderId } =>
      isExternalModel(model)
  )
}

function createRouterModel(
  candidates: Array<ChatModel & { provider: ExternalProviderId }>,
  freeOnly: boolean
): ChatModel | null {
  if (!candidates.length) return null
  let contextWindow = candidates[0].contextWindow
  let speed = candidates[0].speed
  let supportsReasoning = candidates[0].reasoningLevels.length > 0
  const inputModalities = new Set(candidates[0].inputModalities ?? ["text"])
  for (const model of candidates.slice(1)) {
    contextWindow = Math.max(contextWindow, model.contextWindow)
    speed = Math.max(speed, model.speed) as ChatModel["speed"]
    supportsReasoning ||= model.reasoningLevels.length > 0
    for (const modality of model.inputModalities ?? ["text"])
      inputModalities.add(modality)
  }
  return {
    id: freeOnly ? LUMY_FREE_ROUTER_ID : LUMY_ROUTER_ID,
    name: freeOnly ? "Lumy AI Free" : "Lumy AI",
    provider: "lumy",
    providerLabel: "Lumy AI",
    owner: freeOnly
      ? `${candidates.length} modèles gratuits`
      : `${candidates.length} modèles compatibles`,
    contextWindow,
    inputPrice: freeOnly ? 0 : -1,
    outputPrice: freeOnly ? 0 : -1,
    speed,
    isFree: freeOnly,
    recommended: !freeOnly,
    reasoningLevels: supportsReasoning ? ["standard"] : [],
    inputModalities: Array.from(inputModalities),
  }
}

export function createLumyRouterModels(models: ChatModel[]) {
  const allCandidates = externalModels(models)
  const freeCandidates = freeModels(models)
  return [
    createRouterModel(allCandidates, false),
    createRouterModel(freeCandidates, true),
  ].filter((model): model is ChatModel => Boolean(model))
}

export function rankModels(
  models: ChatModel[],
  prompt: string,
  requiredContextTokens = 0,
  freeOnly = false
) {
  const wantsCode = CODE_REQUEST.test(prompt)
  const wantsReasoning = REASONING_REQUEST.test(prompt)
  const wantsLongContext = LONG_CONTEXT_REQUEST.test(prompt)
  const normalizedPrompt = prompt.toLocaleLowerCase("fr")

  const ranked = (freeOnly ? freeModels(models) : externalModels(models))
    .map((model) => {
      const identity = `${model.id} ${model.name}`.toLocaleLowerCase("en")
      let score = model.speed * 3 + Math.log2(model.contextWindow + 1)
      if (model.recommended) score += 12
      if (wantsCode && /code|coder|codex|devstral|qwen.*coder/.test(identity))
        score += 80
      if (!wantsCode && /instruct|chat/.test(identity)) score += 8
      if (wantsReasoning && model.reasoningLevels.length) score += 45
      if (wantsLongContext) score += Math.log2(model.contextWindow + 1) * 2
      if (/70b|72b|405b|deepseek|qwen3|nemotron|mistral/.test(identity))
        score += 10
      score += stableTieBreaker(
        `${normalizedPrompt}:${model.provider}:${model.id}`
      )
      return { model, score }
    })
    .sort((left, right) => right.score - left.score)
    .map(({ model }) => model)

  if (requiredContextTokens <= 0) return ranked
  const fittingModels = ranked.filter(
    (model) => model.contextWindow >= requiredContextTokens
  )
  return fittingModels.length ? fittingModels : ranked
}

export function rankFreeModels(
  models: ChatModel[],
  prompt: string,
  requiredContextTokens = 0
) {
  return rankModels(models, prompt, requiredContextTokens, true)
}
