import { describe, expect, it } from "vitest"
import { getPasswordStrength } from "@/lib/password-strength"

describe("sécurité des mots de passe", () => {
  it("refuse les mots de passe longs mais faciles à deviner", () => {
    expect(getPasswordStrength("motdepasse").secure).toBe(false)
    expect(getPasswordStrength("aaaaaaaaaaaaaa").secure).toBe(false)
  })

  it("reconnaît un mot de passe diversifié", () => {
    expect(getPasswordStrength("Lumy-Zyranex!2026")).toMatchObject({
      secure: true,
      score: 4,
      label: "Très sécurisé",
    })
  })
})
