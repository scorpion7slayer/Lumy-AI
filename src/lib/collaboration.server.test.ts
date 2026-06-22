import { describe, expect, it } from "vitest"
import { canWriteSupportTicket, modelControlAllows } from "@/lib/db.server"

describe("contrôles provider et modèle", () => {
  const controls = [
    { provider: "openrouter", modelId: null, enabled: true },
    { provider: "openrouter", modelId: "google/gemma", enabled: false },
    { provider: "nvidia", modelId: null, enabled: false },
  ]

  it("désactive seulement le modèle du fournisseur ciblé", () => {
    expect(modelControlAllows(controls, "openrouter", "google/gemma")).toBe(
      false
    )
    expect(modelControlAllows(controls, "opencode", "google/gemma")).toBe(true)
    expect(modelControlAllows(controls, "openrouter", "meta/llama")).toBe(true)
  })

  it("donne priorité au blocage global du fournisseur", () => {
    expect(modelControlAllows(controls, "nvidia", "google/gemma")).toBe(false)
  })
})

describe("verrou d’écriture des tickets d’assistance", () => {
  const ticket = {
    requesterUserId: "requester",
    assignedAdminId: "admin-a",
    status: "in_progress" as const,
  }

  it("autorise le demandeur et l’administrateur assigné", () => {
    expect(canWriteSupportTicket(ticket, "requester", false)).toBe(true)
    expect(canWriteSupportTicket(ticket, "admin-a", true)).toBe(true)
  })

  it("laisse les autres admins en lecture seule", () => {
    expect(canWriteSupportTicket(ticket, "admin-b", true)).toBe(false)
  })

  it("interdit tout nouveau message après fermeture", () => {
    expect(
      canWriteSupportTicket({ ...ticket, status: "closed" }, "requester", false)
    ).toBe(false)
    expect(
      canWriteSupportTicket({ ...ticket, status: "closed" }, "admin-a", true)
    ).toBe(false)
  })
})
