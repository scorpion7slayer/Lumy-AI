export type PasswordStrength = {
  score: 0 | 1 | 2 | 3 | 4
  label: "Très faible" | "Faible" | "Moyen" | "Sécurisé" | "Très sécurisé"
  secure: boolean
}

const commonPasswords = new Set([
  "1234567890",
  "azertyuiop",
  "motdepasse",
  "password123",
  "qwertyuiop",
])

export function getPasswordStrength(password: string): PasswordStrength {
  if (!password) return { score: 0, label: "Très faible", secure: false }

  const normalized = password.toLocaleLowerCase("fr")
  if (commonPasswords.has(normalized)) {
    return { score: 0, label: "Très faible", secure: false }
  }

  let points = 0
  if (password.length >= 10) points += 1
  if (password.length >= 14) points += 1
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) points += 1
  if (/\d/.test(password)) points += 1
  if (/[^\p{L}\p{N}\s]/u.test(password)) points += 1
  if (/(.)\1{3,}/u.test(password)) points -= 1

  const score = Math.max(0, Math.min(4, points)) as PasswordStrength["score"]
  const labels = [
    "Très faible",
    "Faible",
    "Moyen",
    "Sécurisé",
    "Très sécurisé",
  ] as const
  return { score, label: labels[score], secure: score >= 3 }
}
