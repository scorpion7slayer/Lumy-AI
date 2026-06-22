// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { AuthGate } from "@/components/auth/auth-gate"

vi.mock("@/components/chat/chat-app", () => ({
  ChatApp: ({ user }: { user: { email: string } }) => (
    <div>Chat ouvert pour {user.email}</div>
  ),
}))

vi.mock("@/components/auth/auth-screen", () => ({
  AuthScreen: () => <div>Écran de connexion</div>,
}))

vi.mock("@/components/auth/verify-email-screen", () => ({
  VerifyEmailScreen: () => <div>Vérification</div>,
}))

const baseUser = {
  id: "user-1",
  email: "marie@example.test",
  name: "Marie Test",
  createdAt: "2026-06-22T12:00:00.000Z",
  role: "user" as const,
  accessStatus: "pending" as const,
  capabilities: {
    appAccess: false,
    adminAccess: false,
    superAdminAccess: false,
  },
  emailVerified: true,
  disabled: false,
}

function sessionResponse(user: unknown) {
  return new Response(JSON.stringify({ user }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  })
}

function jsonResponse(payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  })
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  window.history.replaceState({}, "", "/")
})

describe("garde d’accès anticipé", () => {
  it("bloque le chat tant que la demande est en attente", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(sessionResponse(baseUser))

    render(<AuthGate />)

    expect(await screen.findByText("Demande en attente")).toBeTruthy()
    expect(screen.queryByText(/Chat ouvert/)).toBeNull()
    expect(screen.getByText("marie@example.test")).toBeTruthy()
  })

  it("ouvre le chat lorsque l’accès est accepté", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      sessionResponse({
        ...baseUser,
        accessStatus: "approved",
        capabilities: { ...baseUser.capabilities, appAccess: true },
      })
    )

    render(<AuthGate />)

    expect(
      await screen.findByText("Chat ouvert pour marie@example.test")
    ).toBeTruthy()
  })

  it("laisse un administrateur passer au-dessus de la liste d’attente", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      sessionResponse({
        ...baseUser,
        role: "admin",
        capabilities: { ...baseUser.capabilities, adminAccess: true },
      })
    )

    render(<AuthGate />)

    expect(
      await screen.findByText("Chat ouvert pour marie@example.test")
    ).toBeTruthy()
  })

  it("actualise une demande sans recharger la page", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(sessionResponse(baseUser))
      .mockResolvedValueOnce(
        jsonResponse({ status: "pending", notificationSent: true })
      )
      .mockResolvedValueOnce(
        jsonResponse({ status: "pending", notificationSent: false })
      )
      .mockResolvedValueOnce(
        sessionResponse({
          ...baseUser,
          accessStatus: "approved",
          capabilities: { ...baseUser.capabilities, appAccess: true },
        })
      )

    render(<AuthGate />)
    fireEvent.click(
      await screen.findByRole("button", { name: "Vérifier mon accès" })
    )

    await waitFor(() => expect(screen.getByText(/Chat ouvert/)).toBeTruthy())
    expect(fetchMock).toHaveBeenCalledTimes(4)
  })
})
