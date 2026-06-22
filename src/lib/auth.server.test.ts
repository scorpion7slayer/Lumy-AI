import { describe, expect, it } from "vitest"
import {
  assertSameOrigin,
  hashPassword,
  hashSessionToken,
  normalizeEmail,
  publicUser,
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

  it("refuse un mot de passe long mais trop prévisible", () => {
    expect(
      validateAccountInput({
        name: "Marie",
        email: "marie@example.com",
        password: "aaaaaaaaaaaaaa",
      })
    ).toEqual({
      error:
        "Le mot de passe doit combiner plusieurs types de caractères et être plus difficile à deviner.",
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

  it("expose le rôle et l’état de vérification sans données sensibles", () => {
    expect(
      publicUser({
        id: "admin-1",
        email: "admin@example.com",
        name: "Admin",
        createdAt: "2026-06-22T00:00:00.000Z",
        role: "admin",
        accessStatus: "approved",
        emailVerifiedAt: "2026-06-22T00:01:00.000Z",
        disabledAt: null,
      })
    ).toEqual({
      id: "admin-1",
      email: "admin@example.com",
      name: "Admin",
      createdAt: "2026-06-22T00:00:00.000Z",
      role: "admin",
      accessStatus: "approved",
      capabilities: {
        appAccess: true,
        adminAccess: true,
        superAdminAccess: false,
      },
      emailVerified: true,
      disabled: false,
    })
  })

  it("masque le rôle super administrateur tout en exposant ses capacités", () => {
    expect(
      publicUser({
        id: "owner-1",
        email: "theodarville@gmail.com",
        name: "Propriétaire",
        createdAt: "2026-06-22T00:00:00.000Z",
        role: "super_admin",
        accessStatus: "pending",
        emailVerifiedAt: "2026-06-22T00:01:00.000Z",
        disabledAt: null,
      })
    ).toMatchObject({
      role: "admin",
      accessStatus: "approved",
      capabilities: {
        appAccess: true,
        adminAccess: true,
        superAdminAccess: true,
      },
    })
  })

  it("bloque les capacités applicatives d’un utilisateur en attente", () => {
    expect(
      publicUser({
        id: "user-1",
        email: "user@example.com",
        name: "Utilisateur",
        createdAt: "2026-06-22T00:00:00.000Z",
        role: "user",
        accessStatus: "pending",
        emailVerifiedAt: "2026-06-22T00:01:00.000Z",
        disabledAt: null,
      }).capabilities
    ).toEqual({
      appAccess: false,
      adminAccess: false,
      superAdminAccess: false,
    })
  })

  it("refuse une mutation provenant d’une autre origine", () => {
    expect(() =>
      assertSameOrigin(
        new Request("https://lumy.example/api/admin", {
          headers: { origin: "https://attacker.example" },
        })
      )
    ).toThrow()
  })
})
