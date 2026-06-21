// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { AuthScreen } from "@/components/auth/auth-screen"

afterEach(() => {
  vi.restoreAllMocks()
})

describe("écran d’authentification", () => {
  it("connecte un compte et transmet l’utilisateur authentifié", async () => {
    const onAuthenticated = vi.fn()
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          user: {
            id: "user-1",
            name: "Marie Test",
            email: "marie@example.test",
            createdAt: "2026-06-20T12:00:00.000Z",
          },
        }),
        { status: 201, headers: { "Content-Type": "application/json" } }
      )
    )

    render(<AuthScreen onAuthenticated={onAuthenticated} />)
    fireEvent.change(screen.getByLabelText("Adresse e-mail"), {
      target: { value: "marie@example.test" },
    })
    fireEvent.change(screen.getByLabelText("Mot de passe"), {
      target: { value: "MotDePasse!2026" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Se connecter" }))

    await waitFor(() =>
      expect(onAuthenticated).toHaveBeenCalledWith(
        expect.objectContaining({ email: "marie@example.test" })
      )
    )
    expect(fetch).toHaveBeenCalledWith(
      "/api/auth/login",
      expect.objectContaining({ method: "POST" })
    )
  })
})
