export type AuthUser = {
  id: string
  email: string
  name: string
  createdAt: string
  role: "user" | "admin"
  emailVerified: boolean
  disabled: boolean
}
