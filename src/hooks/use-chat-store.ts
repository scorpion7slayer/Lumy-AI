import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import type {
  AutomaticMemoryCandidate,
  ChatMessage,
  ChatModel,
  Conversation,
  MemoryItem,
  PersistedChatState,
  ReflectionLevel,
  SessionFile,
} from "@/lib/chat-types"
import { mergeAutomaticMemories } from "@/lib/automatic-memory"
import { splitResponseMetadata } from "@/lib/response-metadata"
import { isExternalProviderId } from "@/lib/providers"

const storageKey = (userId: string) => `lumy.chat.v1:${userId}`

export type DatabaseStatus = "connecting" | "connected" | "local" | "error"

const now = () => new Date().toISOString()
const uid = () => crypto.randomUUID()

export function createEmptyChatState(): PersistedChatState {
  return {
    version: 2,
    conversations: [],
    activeConversationId: null,
    selectedModel: null,
    memories: [],
    autoMemory: true,
    files: [],
    webSearch: false,
    reflection: "standard",
  }
}

const oldDemoConversationIds = new Set([
  "meeting",
  "benchmark",
  "linkedin",
  "finance",
])
const oldDemoMemoryIds = new Set(["profile", "goals", "answers"])

export function migrateLegacyChatState(
  value: unknown
): PersistedChatState | null {
  if (!value || typeof value !== "object") return null
  const legacy = value as {
    version?: number
    conversations?: Conversation[]
    activeConversationId?: string
    selectedModel?: ChatModel
    memories?: MemoryItem[]
    files?: SessionFile[]
    webSearch?: boolean
    depth?: string
  }
  if (
    legacy.version !== 1 ||
    !Array.isArray(legacy.conversations) ||
    !Array.isArray(legacy.memories) ||
    !Array.isArray(legacy.files)
  )
    return null

  const conversations = legacy.conversations.flatMap((conversation) => {
    if (
      oldDemoConversationIds.has(conversation.id) &&
      !conversation.messages.length
    )
      return []
    if (conversation.id !== "welcome") return [conversation]
    const messages = conversation.messages.filter(
      (message) => message.id !== "seed-user" && message.id !== "seed-assistant"
    )
    if (!messages.length) return []
    return [
      {
        ...conversation,
        title:
          conversation.title === "Impact de l’IA sur le travail"
            ? "Discussion importée"
            : conversation.title,
        messages,
      },
    ]
  })
  const activeConversationId = conversations.some(
    (conversation) => conversation.id === legacy.activeConversationId
  )
    ? (legacy.activeConversationId ?? null)
    : (conversations[0]?.id ?? null)

  return {
    version: 2,
    conversations,
    activeConversationId,
    selectedModel: null,
    memories: legacy.memories.filter(
      (memory) => !oldDemoMemoryIds.has(memory.id)
    ),
    autoMemory: true,
    files: legacy.files.filter((file) =>
      conversations.some(
        (conversation) => conversation.id === file.conversationId
      )
    ),
    webSearch: Boolean(legacy.webSearch),
    reflection: normalizeReflection(legacy.depth),
  }
}

export function normalizeReflection(value: unknown): ReflectionLevel {
  if (value === "low" || value === "Rapide") return "low"
  if (value === "medium" || value === "Équilibrée") return "medium"
  if (value === "high" || value === "Approfondie") return "high"
  return "standard"
}

export function normalizeChatState(
  state: PersistedChatState
): PersistedChatState {
  const reflection = normalizeReflection(state.reflection)
  const autoMemory =
    typeof state.autoMemory === "boolean" ? state.autoMemory : true
  const emptyConversations = state.conversations.filter(
    (conversation) =>
      conversation.messages.length === 0 &&
      !state.files.some((file) => file.conversationId === conversation.id)
  )
  if (emptyConversations.length < 2) {
    return reflection === state.reflection && autoMemory === state.autoMemory
      ? state
      : { ...state, reflection, autoMemory }
  }

  const activeEmpty = emptyConversations.find(
    (conversation) => conversation.id === state.activeConversationId
  )
  const keptEmptyId = activeEmpty?.id ?? emptyConversations[0].id
  const conversations = state.conversations.filter(
    (conversation) =>
      !emptyConversations.includes(conversation) ||
      conversation.id === keptEmptyId
  )
  return {
    ...state,
    conversations,
    activeConversationId: conversations.some(
      (conversation) => conversation.id === state.activeConversationId
    )
      ? state.activeConversationId
      : keptEmptyId,
    reflection,
    autoMemory,
  }
}

function loadState(userId: string): PersistedChatState {
  if (typeof window === "undefined") return createEmptyChatState()
  try {
    const raw = window.localStorage.getItem(storageKey(userId))
    if (!raw) return createEmptyChatState()
    const parsed = JSON.parse(raw) as unknown
    return normalizeChatState(
      isPersistedChatState(parsed)
        ? parsed
        : (migrateLegacyChatState(parsed) ?? createEmptyChatState())
    )
  } catch {
    return createEmptyChatState()
  }
}

function isPersistedChatState(value: unknown): value is PersistedChatState {
  if (!value || typeof value !== "object") return false
  const state = value as Partial<PersistedChatState>
  return (
    state.version === 2 &&
    Array.isArray(state.conversations) &&
    Array.isArray(state.memories) &&
    Array.isArray(state.files) &&
    (typeof state.activeConversationId === "string" ||
      state.activeConversationId === null) &&
    typeof state.selectedModel === "object" &&
    typeof state.reflection === "string"
  )
}

function updateConversation(
  state: PersistedChatState,
  conversationId: string,
  updater: (conversation: Conversation) => Conversation
) {
  return {
    ...state,
    conversations: state.conversations.map((conversation) =>
      conversation.id === conversationId ? updater(conversation) : conversation
    ),
  }
}

export function estimateTokens(
  messages: ChatMessage[],
  memories: MemoryItem[]
) {
  const messageChars = messages.reduce(
    (total, message) => total + message.content.length,
    0
  )
  const memoryChars = memories
    .filter((memory) => memory.enabled)
    .reduce((total, memory) => total + memory.content.length, 0)
  return Math.max(1, Math.ceil((messageChars + memoryChars) / 3.8))
}

export function extractReasoningText(value: unknown): string {
  if (typeof value === "string") return value
  if (Array.isArray(value)) {
    return value.map(extractReasoningText).filter(Boolean).join("")
  }
  if (!value || typeof value !== "object") return ""
  const detail = value as Record<string, unknown>
  for (const key of ["text", "summary", "content", "reasoning"]) {
    const extracted = extractReasoningText(detail[key])
    if (extracted) return extracted
  }
  return ""
}

export function splitReasoningContent(value: string) {
  const lower = value.toLocaleLowerCase("en")
  const open = lower.indexOf("<think>")
  if (open < 0) return { content: value, reasoning: "" }
  const reasoningStart = open + "<think>".length
  const close = lower.indexOf("</think>", reasoningStart)
  if (close < 0) {
    return {
      content: value.slice(0, open).trimEnd(),
      reasoning: value.slice(reasoningStart),
    }
  }
  return {
    content:
      `${value.slice(0, open)}${value.slice(close + "</think>".length)}`.trimStart(),
    reasoning: value.slice(reasoningStart, close),
  }
}

export function useChatStore(userId: string) {
  const [state, setState] = useState<PersistedChatState>(createEmptyChatState)
  const [hydrated, setHydrated] = useState(false)
  const [databaseStatus, setDatabaseStatus] =
    useState<DatabaseStatus>("connecting")
  const [isGenerating, setIsGenerating] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    let cancelled = false
    const localState = loadState(userId)
    setState(localState)

    const hydrate = async () => {
      try {
        const response = await fetch("/api/state", {
          headers: { Accept: "application/json" },
        })
        if (!response.ok) throw new Error("Synchronisation MySQL indisponible.")
        const payload = (await response.json()) as {
          enabled?: boolean
          state?: unknown
        }
        if (cancelled) return

        if (!payload.enabled) {
          setDatabaseStatus("local")
        } else if (
          isPersistedChatState(payload.state) ||
          migrateLegacyChatState(payload.state)
        ) {
          const remoteState = normalizeChatState(
            isPersistedChatState(payload.state)
              ? payload.state
              : migrateLegacyChatState(payload.state)!
          )
          setState(remoteState)
          setDatabaseStatus("connected")
          if (!isPersistedChatState(payload.state)) {
            void fetch("/api/state", {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ state: remoteState }),
            })
          }
        } else {
          const saveResponse = await fetch("/api/state", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ state: localState }),
          })
          if (!saveResponse.ok)
            throw new Error("Initialisation MySQL impossible.")
          setDatabaseStatus("connected")
        }
      } catch {
        if (!cancelled) setDatabaseStatus("error")
      } finally {
        if (!cancelled) setHydrated(true)
      }
    }

    void hydrate()
    return () => {
      cancelled = true
    }
  }, [userId])

  useEffect(() => {
    if (!hydrated) return
    window.localStorage.setItem(storageKey(userId), JSON.stringify(state))

    if (databaseStatus !== "connected") return
    const controller = new AbortController()
    const timeout = window.setTimeout(async () => {
      try {
        const response = await fetch("/api/state", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ state }),
          signal: controller.signal,
        })
        if (!response.ok) throw new Error("Sauvegarde MySQL impossible.")
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setDatabaseStatus("error")
        }
      }
    }, 500)

    return () => {
      controller.abort()
      window.clearTimeout(timeout)
    }
  }, [databaseStatus, hydrated, state, userId])

  const activeConversation = useMemo(
    () =>
      state.conversations.find(
        (conversation) => conversation.id === state.activeConversationId
      ) ?? null,
    [state.activeConversationId, state.conversations]
  )

  const selectConversation = useCallback((id: string) => {
    setState((current) => ({ ...current, activeConversationId: id }))
  }, [])

  const newConversation = useCallback(() => {
    setState((current) => {
      const active = current.conversations.find(
        (conversation) => conversation.id === current.activeConversationId
      )
      const activeHasFiles = current.files.some(
        (file) => file.conversationId === active?.id
      )
      if (active && active.messages.length === 0 && !activeHasFiles)
        return current

      const id = uid()
      const createdAt = now()
      const conversation: Conversation = {
        id,
        title: "Nouvelle discussion",
        messages: [],
        createdAt,
        updatedAt: createdAt,
      }
      return {
        ...current,
        activeConversationId: id,
        conversations: [conversation, ...current.conversations],
      }
    })
  }, [])

  const renameConversation = useCallback((id: string, title: string) => {
    setState((current) =>
      updateConversation(current, id, (conversation) => ({
        ...conversation,
        title,
      }))
    )
  }, [])

  const deleteConversation = useCallback(
    (id: string) => {
      const fileIds = state.files
        .filter((file) => file.conversationId === id)
        .map((file) => file.id)
      void Promise.all(
        fileIds.map((fileId) =>
          fetch(`/api/files/${encodeURIComponent(fileId)}`, {
            method: "DELETE",
          })
        )
      )
      setState((current) => {
        const conversations = current.conversations.filter(
          (item) => item.id !== id
        )
        if (conversations.length === 0) {
          return {
            ...current,
            conversations: [],
            activeConversationId: null,
            files: current.files.filter((file) => file.conversationId !== id),
          }
        }
        return {
          ...current,
          conversations,
          files: current.files.filter((file) => file.conversationId !== id),
          activeConversationId:
            current.activeConversationId === id
              ? conversations[0].id
              : current.activeConversationId,
        }
      })
    },
    [state.files]
  )

  const togglePinned = useCallback((id: string) => {
    setState((current) =>
      updateConversation(current, id, (conversation) => ({
        ...conversation,
        pinned: !conversation.pinned,
      }))
    )
  }, [])

  const setSelectedModel = useCallback((model: ChatModel | null) => {
    setState((current) => {
      const levels = model?.reasoningLevels ?? []
      const reflection = levels.includes(current.reflection)
        ? current.reflection
        : levels.includes("medium")
          ? "medium"
          : (levels[0] ?? "standard")
      return {
        ...current,
        selectedModel: model,
        reflection,
        webSearch: model ? current.webSearch : false,
      }
    })
  }, [])

  const toggleMemory = useCallback((id: string) => {
    setState((current) => ({
      ...current,
      memories: current.memories.map((memory) =>
        memory.id === id ? { ...memory, enabled: !memory.enabled } : memory
      ),
    }))
  }, [])

  const addMemory = useCallback((title: string, content: string) => {
    if (!title.trim() || !content.trim()) return
    setState((current) => ({
      ...current,
      memories: [
        ...current.memories,
        {
          id: uid(),
          title: title.trim(),
          content: content.trim(),
          updatedAt: now(),
          enabled: true,
          source: "manual",
        },
      ],
    }))
  }, [])

  const updateMemory = useCallback(
    (id: string, title: string, content: string) => {
      if (!title.trim() || !content.trim()) return
      setState((current) => ({
        ...current,
        memories: current.memories.map((memory) =>
          memory.id === id
            ? {
                ...memory,
                title: title.trim(),
                content: content.trim(),
                updatedAt: now(),
                source: "manual",
              }
            : memory
        ),
      }))
    },
    []
  )

  const deleteMemory = useCallback((id: string) => {
    setState((current) => ({
      ...current,
      memories: current.memories.filter((memory) => memory.id !== id),
    }))
  }, [])

  const addFiles = useCallback(
    async (files: FileList | null) => {
      if (!files?.length) return
      const conversationId = activeConversation?.id ?? uid()
      if (!activeConversation) {
        const createdAt = now()
        setState((current) => ({
          ...current,
          activeConversationId: conversationId,
          conversations: [
            {
              id: conversationId,
              title: "Nouvelle discussion",
              messages: [],
              createdAt,
              updatedAt: createdAt,
            },
            ...current.conversations,
          ],
        }))
      }
      const form = new FormData()
      form.set("conversationId", conversationId)
      for (const file of Array.from(files)) form.append("files", file)
      try {
        const response = await fetch("/api/files", {
          method: "POST",
          body: form,
        })
        const payload = (await response.json().catch(() => ({}))) as {
          files?: SessionFile[]
          error?: string
        }
        if (!response.ok || !payload.files)
          throw new Error(payload.error ?? "Envoi impossible.")
        setState((current) => ({
          ...current,
          files: [...current.files, ...payload.files!],
        }))
        toast.success(
          `${payload.files.length} fichier${payload.files.length > 1 ? "s" : ""} ajouté${payload.files.length > 1 ? "s" : ""}`
        )
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Envoi impossible."
        )
      }
    },
    [activeConversation]
  )

  const removeFile = useCallback(async (id: string) => {
    const response = await fetch(`/api/files/${encodeURIComponent(id)}`, {
      method: "DELETE",
    })
    if (!response.ok) {
      toast.error("Suppression du fichier impossible.")
      return
    }
    setState((current) => ({
      ...current,
      files: current.files.filter((file) => file.id !== id),
    }))
    toast.success("Fichier supprimé")
  }, [])

  const setWebSearch = useCallback((value: boolean) => {
    setState((current) => ({ ...current, webSearch: value }))
  }, [])

  const setAutoMemory = useCallback((value: boolean) => {
    setState((current) => ({ ...current, autoMemory: value }))
  }, [])

  const setReflection = useCallback((reflection: ReflectionLevel) => {
    setState((current) => ({ ...current, reflection }))
  }, [])

  const stopGeneration = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    setIsGenerating(false)
  }, [])

  const captureAutomaticMemories = useCallback(
    async ({
      provider,
      model,
      userMessages,
      memories,
    }: {
      provider: ChatModel["provider"]
      model: string
      userMessages: string[]
      memories: MemoryItem[]
    }) => {
      try {
        const response = await fetch("/api/memory/extract", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ provider, model, userMessages, memories }),
        })
        if (!response.ok) return
        const payload = (await response.json()) as {
          memories?: AutomaticMemoryCandidate[]
        }
        const candidates = Array.isArray(payload.memories)
          ? payload.memories
          : []
        if (!candidates.length) return
        setState((current) => {
          if (!current.autoMemory) return current
          const merged = mergeAutomaticMemories(current.memories, candidates)
          if (!merged.added && !merged.updated) return current
          return { ...current, memories: merged.memories }
        })
        toast.success(
          candidates.length === 1
            ? "Lumy a mémorisé une information utile."
            : `Lumy a mémorisé ${candidates.length} informations utiles.`
        )
      } catch {
        // Memory analysis is optional and must never interrupt the chat.
      }
    },
    []
  )

  const sendMessage = useCallback(
    async (content: string) => {
      const trimmed = content.trim()
      if (!trimmed || isGenerating) return
      if (!state.selectedModel) {
        toast.error(
          "Aucun modèle n’a été détecté. Configurez une clé API pour commencer."
        )
        return
      }

      const conversationId = activeConversation?.id ?? uid()
      const userMessage: ChatMessage = {
        id: uid(),
        role: "user",
        content: trimmed,
        createdAt: now(),
      }
      const assistantId = uid()
      const assistantMessage: ChatMessage = {
        id: assistantId,
        role: "assistant",
        content: "",
        createdAt: now(),
        modelId: state.selectedModel.id,
        streaming: true,
        reasoning: "",
        reasoningStreaming: state.selectedModel.reasoningLevels.length > 0,
      }
      const messages = [...(activeConversation?.messages ?? []), userMessage]

      setState((current) => {
        const existing = current.conversations.some(
          (conversation) => conversation.id === conversationId
        )
        if (!existing) {
          const createdAt = now()
          return {
            ...current,
            activeConversationId: conversationId,
            conversations: [
              {
                id: conversationId,
                title: trimmed.slice(0, 46) + (trimmed.length > 46 ? "…" : ""),
                createdAt,
                updatedAt: createdAt,
                messages: [...messages, assistantMessage],
              },
              ...current.conversations,
            ],
          }
        }
        return updateConversation(current, conversationId, (conversation) => ({
          ...conversation,
          title:
            conversation.messages.length === 0
              ? trimmed.slice(0, 46) + (trimmed.length > 46 ? "…" : "")
              : conversation.title,
          updatedAt: now(),
          messages: [...messages, assistantMessage],
        }))
      })
      setIsGenerating(true)
      const controller = new AbortController()
      abortRef.current = controller

      try {
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            provider: state.selectedModel.provider,
            model: state.selectedModel.id,
            messages: messages.map(({ role, content: messageContent }) => ({
              role,
              content: messageContent,
            })),
            memories: state.memories
              .filter((memory) => memory.enabled)
              .map(({ id, title, content: memoryContent }) => ({
                id,
                title,
                content: memoryContent,
              })),
            preferences: {
              reflection: state.reflection,
              reasoningEnabled: state.selectedModel.reasoningLevels.length > 0,
              webSearch: state.webSearch,
            },
            fileIds: state.files
              .filter((file) => file.conversationId === conversationId)
              .map((file) => file.id),
          }),
        })

        if (!response.ok || !response.body) {
          const message = await response.text()
          throw new Error(message || "Le fournisseur n’a pas répondu.")
        }

        const routedProviderHeader = response.headers.get("X-Lumy-Provider")
        const routedProvider = isExternalProviderId(routedProviderHeader)
          ? routedProviderHeader
          : undefined
        const routedModelId = response.headers.get("X-Lumy-Model") ?? undefined
        const fallbackCount = Number(
          response.headers.get("X-Lumy-Fallbacks") ?? 0
        )
        if (state.selectedModel.provider === "lumy" && routedProvider) {
          setState((current) =>
            updateConversation(current, conversationId, (conversation) => ({
              ...conversation,
              messages: conversation.messages.map((message) =>
                message.id === assistantId
                  ? {
                      ...message,
                      routedProvider,
                      routedModelId,
                      fallbackCount: Number.isFinite(fallbackCount)
                        ? fallbackCount
                        : 0,
                    }
                  : message
              ),
            }))
          )
        }

        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ""
        let accumulatedRawContent = ""
        let accumulatedReasoning = ""

        let streamChunk = await reader.read()
        while (!streamChunk.done) {
          const { value } = streamChunk
          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split("\n")
          buffer = lines.pop() ?? ""

          for (const line of lines) {
            const normalized = line.trim()
            if (!normalized.startsWith("data:")) continue
            const payload = normalized.slice(5).trim()
            if (!payload || payload === "[DONE]") continue
            try {
              const parsed = JSON.parse(payload) as {
                choices?: Array<{
                  delta?: {
                    content?: string
                    reasoning?: unknown
                    reasoning_content?: unknown
                    reasoning_details?: unknown
                  }
                }>
                content?: string
              }
              const delta =
                parsed.content ?? parsed.choices?.[0]?.delta?.content ?? ""
              const reasoningDelta = extractReasoningText(
                parsed.choices?.[0]?.delta?.reasoning_details ??
                  parsed.choices?.[0]?.delta?.reasoning ??
                  parsed.choices?.[0]?.delta?.reasoning_content
              )
              if (!delta && !reasoningDelta) continue
              accumulatedRawContent += delta
              accumulatedReasoning += reasoningDelta
              const split = splitReasoningContent(accumulatedRawContent)
              const metadata = splitResponseMetadata(split.content)
              const contentSnapshot = metadata.content
              const reasoningSnapshot = accumulatedReasoning || split.reasoning
              setState((current) =>
                updateConversation(current, conversationId, (conversation) => ({
                  ...conversation,
                  messages: conversation.messages.map((message) =>
                    message.id === assistantId
                      ? {
                          ...message,
                          content: contentSnapshot,
                          reasoning: reasoningSnapshot,
                          usedMemoryIds: metadata.usedMemoryIds,
                        }
                      : message
                  ),
                }))
              )
            } catch {
              // Ignore non-JSON keepalive lines from upstream SSE providers.
            }
          }
          streamChunk = await reader.read()
        }

        const finalSplit = splitReasoningContent(accumulatedRawContent)
        const finalMetadata = splitResponseMetadata(finalSplit.content)
        const finalReasoning = accumulatedReasoning || finalSplit.reasoning

        setState((current) =>
          updateConversation(current, conversationId, (conversation) => ({
            ...conversation,
            messages: conversation.messages.map((message) =>
              message.id === assistantId
                ? {
                    ...message,
                    streaming: false,
                    reasoningStreaming: false,
                    reasoning: finalReasoning,
                    usedMemoryIds: finalMetadata.usedMemoryIds,
                    content:
                      finalMetadata.content ||
                      (finalReasoning
                        ? "Le modèle n’a pas produit de réponse finale."
                        : "Réponse vide."),
                  }
                : message
            ),
          }))
        )
        if (state.autoMemory) {
          void captureAutomaticMemories({
            provider: state.selectedModel.provider,
            model: state.selectedModel.id,
            userMessages: messages
              .filter((message) => message.role === "user")
              .slice(-4)
              .map((message) => message.content),
            memories: state.memories,
          })
        }
      } catch (error) {
        const aborted =
          error instanceof DOMException && error.name === "AbortError"
        setState((current) =>
          updateConversation(current, conversationId, (conversation) => ({
            ...conversation,
            messages: conversation.messages.map((message) =>
              message.id === assistantId
                ? {
                    ...message,
                    streaming: false,
                    reasoningStreaming: false,
                    error: !aborted,
                    content: aborted
                      ? message.content || "Génération interrompue."
                      : "Impossible de joindre le modèle. Vérifiez la clé API du fournisseur puis réessayez.",
                  }
                : message
            ),
          }))
        )
      } finally {
        abortRef.current = null
        setIsGenerating(false)
      }
    },
    [
      activeConversation,
      captureAutomaticMemories,
      isGenerating,
      state.autoMemory,
      state.files,
      state.memories,
      state.reflection,
      state.selectedModel,
      state.webSearch,
    ]
  )

  return {
    state,
    hydrated,
    databaseStatus,
    activeConversation,
    isGenerating,
    selectConversation,
    newConversation,
    renameConversation,
    deleteConversation,
    togglePinned,
    setSelectedModel,
    toggleMemory,
    addMemory,
    updateMemory,
    deleteMemory,
    addFiles,
    removeFile,
    setWebSearch,
    setAutoMemory,
    setReflection,
    sendMessage,
    stopGeneration,
  }
}
