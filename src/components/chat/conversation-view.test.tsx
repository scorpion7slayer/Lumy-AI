// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import type { ChatModel, Conversation, MemoryItem } from "@/lib/chat-types"
import { ConversationView } from "@/components/chat/conversation-view"
import { TooltipProvider } from "@/components/ui/tooltip"

const conversation: Conversation = {
  id: "conversation",
  title: "Test",
  messages: [],
  createdAt: "2026-06-20T00:00:00.000Z",
  updatedAt: "2026-06-20T00:00:00.000Z",
}

const baseModel: ChatModel = {
  id: "vendor/model",
  name: "Model",
  provider: "openrouter",
  providerLabel: "OpenRouter",
  owner: "Vendor",
  contextWindow: 128_000,
  inputPrice: 0,
  outputPrice: 0,
  speed: 4,
  isFree: true,
  reasoningLevels: [],
}

function renderView(
  model: ChatModel | null,
  currentConversation = conversation,
  memories: MemoryItem[] = []
) {
  return render(
    <TooltipProvider>
      <ConversationView
        conversation={currentConversation}
        isGenerating={false}
        model={model}
        modelAvailable={Boolean(model)}
        memories={memories}
        webSearch={false}
        webSearchAvailable={Boolean(model)}
        reflection="standard"
        onWebSearchChange={vi.fn()}
        onReflectionChange={vi.fn()}
        onSend={vi.fn()}
        onStop={vi.fn()}
        onAddFiles={vi.fn()}
        userName="Test User"
      />
    </TooltipProvider>
  )
}

describe("conversation view", () => {
  beforeEach(() => {
    vi.stubGlobal("requestAnimationFrame", () => 1)
    vi.stubGlobal("cancelAnimationFrame", () => undefined)
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      }
    )
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it("keeps the composer in the layout after the scrollable messages", () => {
    const { container } = renderView(baseModel)
    const scrollArea = screen.getByTestId("conversation-scroll")
    const composer = scrollArea.nextElementSibling

    expect(container.querySelector("main")?.contains(scrollArea)).toBe(true)
    expect(composer?.className).toContain("shrink-0")
    expect(composer?.className).not.toContain("absolute inset-x-0 bottom-0")
  })

  it("shows fixed and unavailable reflection states per model", () => {
    const { rerender } = renderView({
      ...baseModel,
      reasoningLevels: ["standard"],
    })
    expect(screen.queryByText("Réflexion automatique")).not.toBeNull()

    rerender(
      <TooltipProvider>
        <ConversationView
          conversation={conversation}
          isGenerating={false}
          model={null}
          modelAvailable={false}
          memories={[]}
          webSearch={false}
          webSearchAvailable={false}
          reflection="standard"
          onWebSearchChange={vi.fn()}
          onReflectionChange={vi.fn()}
          onSend={vi.fn()}
          onStop={vi.fn()}
          onAddFiles={vi.fn()}
          userName="Test User"
        />
      </TooltipProvider>
    )
    expect(screen.queryByText("Sans réflexion")).not.toBeNull()
  })

  it("indique discrètement le fournisseur choisi par Lumy AI", () => {
    renderView(baseModel, {
      ...conversation,
      messages: [
        {
          id: "assistant",
          role: "assistant",
          content: "Réponse",
          createdAt: "2026-06-20T00:00:00.000Z",
          routedProvider: "nvidia",
          routedModelId: "meta/llama-3.3-70b-instruct",
          fallbackCount: 1,
        },
      ],
    })
    expect(screen.queryByText("NVIDIA NIM")).not.toBeNull()
  })

  it("shows which memory was used in an assistant response", async () => {
    renderView(
      baseModel,
      {
        ...conversation,
        messages: [
          {
            id: "answer",
            role: "assistant",
            content: "Réponse personnalisée.",
            createdAt: "2026-06-20T00:00:00.000Z",
            usedMemoryIds: ["preference"],
          },
        ],
      },
      [
        {
          id: "preference",
          title: "Format préféré",
          content: "Réponses courtes.",
          updatedAt: "2026-06-20T00:00:00.000Z",
          enabled: true,
        },
      ]
    )

    const indicator = screen.getByRole("button", {
      name: "Cette réponse utilise la mémoire",
    })
    fireEvent.focus(indicator)
    expect(
      (await screen.findAllByText("Format préféré")).length
    ).toBeGreaterThan(0)
  })
})
