import { describe, expect, it } from "vitest"
import {
  createEmptyChatState,
  migrateLegacyChatState,
  normalizeChatState,
  normalizeReflection,
  splitReasoningContent,
  extractReasoningText,
} from "@/hooks/use-chat-store"

describe("initial chat state", () => {
  it("starts with a genuinely empty workspace", () => {
    expect(createEmptyChatState()).toMatchObject({
      version: 2,
      conversations: [],
      activeConversationId: null,
      selectedModel: null,
      memories: [],
      autoMemory: true,
      files: [],
      webSearch: false,
      reflection: "standard",
    })
  })

  it("removes old demo content while preserving user content", () => {
    const migrated = migrateLegacyChatState({
      version: 1,
      conversations: [
        {
          id: "welcome",
          title: "Impact de l’IA sur le travail",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
          messages: [
            {
              id: "seed-user",
              role: "user",
              content: "Démo",
              createdAt: "2026-01-01T00:00:00.000Z",
            },
          ],
        },
        {
          id: "real",
          title: "Ma discussion",
          createdAt: "2026-01-02T00:00:00.000Z",
          updatedAt: "2026-01-02T00:00:00.000Z",
          messages: [],
        },
      ],
      activeConversationId: "welcome",
      selectedModel: null,
      memories: [
        {
          id: "profile",
          title: "Profil professionnel",
          content: "Démo",
          updatedAt: "2026-01-01T00:00:00.000Z",
          enabled: true,
        },
        {
          id: "real-memory",
          title: "Ma préférence",
          content: "Réponses courtes",
          updatedAt: "2026-01-02T00:00:00.000Z",
          enabled: true,
        },
      ],
      files: [],
      webSearch: false,
      depth: "Rapide",
    })

    expect(
      migrated?.conversations.map((conversation) => conversation.id)
    ).toEqual(["real"])
    expect(migrated?.activeConversationId).toBe("real")
    expect(migrated?.memories.map((memory) => memory.id)).toEqual([
      "real-memory",
    ])
    expect(migrated?.autoMemory).toBe(true)
    expect(migrated?.reflection).toBe("low")
  })

  it("collapses duplicate empty conversations", () => {
    const emptyState = createEmptyChatState()
    const normalized = normalizeChatState({
      ...emptyState,
      activeConversationId: "second",
      conversations: [
        {
          id: "first",
          title: "Nouvelle discussion",
          messages: [],
          createdAt: "2026-06-20T10:00:00.000Z",
          updatedAt: "2026-06-20T10:00:00.000Z",
        },
        {
          id: "second",
          title: "Nouvelle discussion",
          messages: [],
          createdAt: "2026-06-20T11:00:00.000Z",
          updatedAt: "2026-06-20T11:00:00.000Z",
        },
      ],
    })

    expect(
      normalized.conversations.map((conversation) => conversation.id)
    ).toEqual(["second"])
    expect(normalized.activeConversationId).toBe("second")
  })

  it("normalizes legacy reflection labels", () => {
    expect(normalizeReflection("Rapide")).toBe("low")
    expect(normalizeReflection("Équilibrée")).toBe("medium")
    expect(normalizeReflection("Approfondie")).toBe("high")
    expect(normalizeReflection("unknown")).toBe("standard")
  })

  it("separates provider thinking tags from the final answer", () => {
    expect(
      splitReasoningContent("<think>Je vérifie.</think>Voici la réponse.")
    ).toEqual({ content: "Voici la réponse.", reasoning: "Je vérifie." })
    expect(splitReasoningContent("<think>En cours")).toEqual({
      content: "",
      reasoning: "En cours",
    })
  })

  it("extracts text but ignores encrypted reasoning metadata", () => {
    expect(
      extractReasoningText([{ type: "reasoning.text", text: "Étape 1" }])
    ).toBe("Étape 1")
    expect(extractReasoningText({ data: "opaque-signature" })).toBe("")
  })
})
