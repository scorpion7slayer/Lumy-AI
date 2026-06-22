// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { AuthScreen } from "@/components/auth/auth-screen"

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe("écran d’authentification", () => {
  it("affiche le logo Lumy AI", () => {
    render(<AuthScreen onAuthenticated={vi.fn()} />)

    expect(screen.getAllByRole("img", { name: "Lumy AI" })).toHaveLength(2)
    expect(
      screen.getAllByRole("img", { name: "Lumy AI" })[0].getAttribute("src")
    ).toBe("/lumyailogo.webp")
  })

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

  it("affiche la robustesse et demande la vérification après inscription", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          verificationRequired: true,
          email: "marie@example.com",
        }),
        { status: 201, headers: { "Content-Type": "application/json" } }
      )
    )

    render(<AuthScreen initialMode="register" onAuthenticated={vi.fn()} />)
    fireEvent.change(screen.getByLabelText("Nom"), {
      target: { value: "Marie Test" },
    })
    fireEvent.change(screen.getByLabelText("Adresse e-mail"), {
      target: { value: "marie@example.com" },
    })
    fireEvent.change(screen.getByLabelText("Mot de passe"), {
      target: { value: "Lumy-Zyranex!2026" },
    })

    expect(
      screen.getByText("Sécurité du mot de passe : Très sécurisé")
    ).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Créer mon espace" }))

    await waitFor(() =>
      expect(
        screen.getByText(
          "Un lien de vérification vient d’être envoyé. Ouvrez-le avant de vous connecter."
        )
      ).toBeTruthy()
    )
  })
})
