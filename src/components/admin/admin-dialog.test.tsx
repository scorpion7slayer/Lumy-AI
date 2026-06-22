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
  viewerCapabilities: {
    appAccess: true,
    adminAccess: true,
    superAdminAccess: true,
  },
  users: [
    {
      id: "admin-1",
      email: "admin@example.test",
      name: "Admin",
      role: "admin",
      accessStatus: "approved",
      accessRequestedAt: null,
      accessReviewedAt: null,
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
      accessStatus: "pending",
      accessRequestedAt: "2026-06-21T09:00:00.000Z",
      accessReviewedAt: null,
      emailVerified: true,
      disabled: false,
      createdAt: "2026-06-21T10:00:00.000Z",
      fileCount: 0,
      feedbackCount: 0,
      sessionCount: 1,
    },
  ],
  feedback: [],
  incidents: [],
  modelManagement: [],
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

  it("limite un administrateur normal aux informations de compte", async () => {
    const normalOverview: AdminOverview = {
      ...overview,
      viewerCapabilities: {
        appAccess: true,
        adminAccess: true,
        superAdminAccess: false,
      },
      feedback: [],
      incidents: [],
      selected: null,
    }
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify(normalOverview), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    )

    render(<AdminDialog open onOpenChange={vi.fn()} currentUserId="admin-1" />)

    expect(
      (await screen.findAllByText("Personne test")).length
    ).toBeGreaterThan(0)
    expect(screen.getByText("Informations du compte")).toBeTruthy()
    expect(screen.queryByText("Projet confidentiel")).toBeNull()
    expect(screen.queryByRole("tab", { name: /Feedback/ })).toBeNull()
    expect(screen.getByRole("tab", { name: /Accès anticipé/ })).toBeTruthy()
    expect(screen.queryByRole("tab", { name: /Incidents/ })).toBeNull()
    expect(screen.queryByText(/Super admin/i)).toBeNull()
    expect(screen.getAllByText("Admin").length).toBeGreaterThan(0)
  })

  it("permet au super administrateur de traiter la liste d’attente", async () => {
    render(<AdminDialog open onOpenChange={vi.fn()} currentUserId="admin-1" />)

    fireEvent.mouseDown(
      await screen.findByRole("tab", { name: /Accès anticipé/ }),
      { button: 0, ctrlKey: false }
    )
    fireEvent.click(screen.getByRole("button", { name: "Accepter" }))

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        "/api/admin",
        expect.objectContaining({
          method: "PATCH",
          body: expect.stringContaining('"action":"early_access"'),
        })
      )
    )
    expect(screen.queryByText(/Super admin/i)).toBeNull()
  })

  it("affiche et résout les incidents modèles uniquement au super administrateur", async () => {
    const incidentOverview: AdminOverview = {
      ...overview,
      incidents: [
        {
          id: "incident-1",
          requestId: "request-1",
          userId: "user-2",
          requestedProvider: "lumy",
          requestedModel: "lumy/free-router",
          provider: "openrouter",
          model: "provider/model-en-panne",
          httpStatus: 503,
          failureKind: "upstream_error",
          sanitizedDetail: "Le fournisseur a refusé la requête.",
          surfacedToUser: true,
          occurrenceCount: 3,
          firstOccurredAt: "2026-06-22T10:00:00.000Z",
          lastOccurredAt: "2026-06-22T11:00:00.000Z",
          resolvedAt: null,
          resolvedByUserId: null,
        },
      ],
    }
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify(incidentOverview), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    )

    render(<AdminDialog open onOpenChange={vi.fn()} currentUserId="admin-1" />)
    fireEvent.mouseDown(await screen.findByRole("tab", { name: /Incidents/ }), {
      button: 0,
      ctrlKey: false,
    })

    expect(screen.getByText("provider/model-en-panne")).toBeTruthy()
    expect(screen.getByText("openrouter")).toBeTruthy()
    expect(screen.getByText("3 occurrences")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Marquer résolu" }))

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        "/api/admin",
        expect.objectContaining({
          method: "PATCH",
          body: expect.stringContaining('"action":"resolve_incident"'),
        })
      )
    )
  })
})
