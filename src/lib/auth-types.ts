export type EarlyAccessStatus = "pending" | "approved" | "rejected"

export type UserCapabilities = {
  appAccess: boolean
  adminAccess: boolean
  superAdminAccess: boolean
}

export type AuthUser = {
  id: string
  email: string
  name: string
  createdAt: string
  role: "user" | "admin"
  accessStatus: EarlyAccessStatus
  capabilities: UserCapabilities
  emailVerified: boolean
  disabled: boolean
}
