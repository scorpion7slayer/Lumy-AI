import { describe, expect, it } from "vitest"
import {
  hashPassword,
  hashSessionToken,
  normalizeEmail,
  validateAccountInput,
  verifyPassword,
} from "@/lib/auth.server"

describe("authentification Lumy", () => {
  it("normalise les adresses e-mail", () => {
    expect(normalizeEmail("  Marie@Example.COM ")).toBe("marie@example.com")
  })

  it("refuse les mots de passe trop courts", () => {
    expect(
      validateAccountInput({
        name: "Marie",
        email: "marie@example.com",
        password: "court",
      })
    ).toEqual({
      error: "Le mot de passe doit contenir au moins 10 caractères.",
    })
  })

  it("hachage et vérification du mot de passe sont cohérents", async () => {
    const hash = await hashPassword("MotDePasse!2026")
    await expect(verifyPassword("MotDePasse!2026", hash)).resolves.toBe(true)
    await expect(verifyPassword("MotDePasseIncorrect", hash)).resolves.toBe(
      false
    )
  })

  it("ne conserve jamais le jeton de session en clair", () => {
    const token = "jeton-temporaire"
    const hash = hashSessionToken(token)
    expect(hash).toHaveLength(64)
    expect(hash).not.toContain(token)
  })
})
