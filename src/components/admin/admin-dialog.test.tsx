// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import AdminDialog from "@/components/admin/admin-dialog"
import type { AdminOverview } from "@/lib/admin-types"

const overview: AdminOverview = {
  users: [
    {
      id: "admin-1",
      email: "admin@example.test",
      name: "Admin",
      role: "admin",
      emailVerified: true,
      disabled: false,
      createdAt: "2026-06-20T10:00:00.000Z",
      fileCount: 0,
      feedbackCount: 0,
      sessionCount: 1,
    },
    {
      id: "user-2",
      email: "personne@example.test",
      name: "Personne test",
      role: "user",
      emailVerified: true,
      disabled: false,
      createdAt: "2026-06-21T10:00:00.000Z",
      fileCount: 0,
      feedbackCount: 0,
      sessionCount: 1,
    },
  ],
  feedback: [],
  selected: {
    userId: "user-2",
    state: {
      version: 2,
      conversations: [
        {
          id: "chat-1",
          title: "Projet confidentiel",
          createdAt: "2026-06-21T11:00:00.000Z",
          updatedAt: "2026-06-21T12:00:00.000Z",
          messages: [
            {
              id: "message-1",
              role: "user",
              content: "Voici le contexte complet de mon projet.",
              createdAt: "2026-06-21T11:00:00.000Z",
            },
            {
              id: "message-2",
              role: "assistant",
              content: "Réponse **complète** de l’assistant.",
              reasoning: "Analyse visible par l’administrateur.",
              createdAt: "2026-06-21T11:01:00.000Z",
              modelId: "provider/model",
              responseTimeMs: 2_400,
            },
          ],
        },
      ],
      activeConversationId: "chat-1",
      selectedModel: null,
      memories: [],
      autoMemory: false,
      files: [],
      webSearch: false,
      reflection: "standard",
    },
    files: [],
    sessions: [
      {
        id: "session-1",
        createdAt: "2026-06-21T10:00:00.000Z",
        expiresAt: "2026-07-21T10:00:00.000Z",
      },
    ],
  },
}

describe("administration", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      }
    )
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(overview), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    )
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it("ouvre une conversation utilisateur complète et masque les secrets de session", async () => {
    render(<AdminDialog open onOpenChange={vi.fn()} currentUserId="admin-1" />)

    expect(
      (await screen.findAllByText("Personne test")).length
    ).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole("button", { name: /Projet confidentiel/ }))

    expect(
      screen.getByText("Voici le contexte complet de mon projet.")
    ).toBeTruthy()
    expect(screen.getByText("complète")).toBeTruthy()
    expect(screen.getByText("Réflexion du modèle")).toBeTruthy()
    expect(screen.getByText("Sessions et cookies (1)")).toBeTruthy()
    expect(screen.queryByText(/fichier \.env/i)).toBeNull()
    expect(screen.queryByText("session-1")).toBeNull()
    expect(screen.queryByText(/token/i)).toBeNull()

    await waitFor(() => expect(fetch).toHaveBeenCalledWith("/api/admin"))
  })
})
