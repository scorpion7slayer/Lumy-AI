export type ExternalProviderId = "openrouter" | "kilo" | "opencode" | "nvidia"
export type ProviderId = ExternalProviderId | "lumy"
export type ReflectionLevel = "standard" | "low" | "medium" | "high"

export type ChatModel = {
  id: string
  name: string
  provider: ProviderId
  providerLabel: string
  owner: string
  contextWindow: number
  inputPrice: number
  outputPrice: number
  speed: 1 | 2 | 3 | 4
  isFree: boolean
  recommended?: boolean
  reasoningLevels: ReflectionLevel[]
  inputModalities?: string[]
}

export type ChatRole = "user" | "assistant"

export type ChatMessage = {
  id: string
  role: ChatRole
  content: string
  createdAt: string
  modelId?: string
  streaming?: boolean
  error?: boolean
  reasoning?: string
  reasoningStreaming?: boolean
  usedMemoryIds?: string[]
  routedProvider?: ExternalProviderId
  routedModelId?: string
  routedContextWindow?: number
  fallbackCount?: number
  firstTokenTimeMs?: number
  responseTimeMs?: number
  reasoningTimeMs?: number
}

export type Conversation = {
  id: string
  title: string
  messages: ChatMessage[]
  createdAt: string
  updatedAt: string
  pinned?: boolean
}

export type MemoryItem = {
  id: string
  title: string
  content: string
  updatedAt: string
  enabled: boolean
  source?: "manual" | "automatic"
}

export type AutomaticMemoryCandidate = {
  title: string
  content: string
  replacesId?: string
}

export type SessionFile = {
  id: string
  conversationId: string
  name: string
  size: number
  type: string
}

export type PersistedChatState = {
  version: 2
  conversations: Conversation[]
  activeConversationId: string | null
  selectedModel: ChatModel | null
  memories: MemoryItem[]
  autoMemory: boolean
  files: SessionFile[]
  webSearch: boolean
  reflection: ReflectionLevel
}
