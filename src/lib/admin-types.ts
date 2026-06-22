import type { PersistedChatState, SessionFile } from "@/lib/chat-types"
import type { EarlyAccessStatus, UserCapabilities } from "@/lib/auth-types"

export type AdminUserSummary = {
  id: string
  email: string
  name: string
  role: "user" | "admin"
  accessStatus: EarlyAccessStatus
  accessRequestedAt: string | null
  accessReviewedAt: string | null
  emailVerified: boolean
  disabled: boolean
  createdAt: string
  fileCount: number
  feedbackCount: number
  sessionCount: number
}

export type AdminIncident = {
  id: string
  requestId: string | null
  userId: string | null
  requestedProvider: string | null
  requestedModel: string | null
  provider: string
  model: string
  httpStatus: number
  failureKind: string
  sanitizedDetail: string
  surfacedToUser: boolean
  occurrenceCount: number
  firstOccurredAt: string
  lastOccurredAt: string
  resolvedAt: string | null
  resolvedByUserId: string | null
}

export type AdminSession = {
  id: string
  createdAt: string
  expiresAt: string
}

export type AdminFeedback = {
  id: string
  userId: string
  userName: string
  userEmail: string
  category: "idea" | "bug" | "other"
  message: string
  status: "new" | "reviewed" | "resolved"
  createdAt: string
  updatedAt: string
}

export type AdminManagedModel = {
  provider: string
  providerLabel: string
  id: string
  name: string
  enabled: boolean
  incidentCount: number
}

export type AdminManagedProvider = {
  id: string
  label: string
  enabled: boolean
  incidentCount: number
  models: AdminManagedModel[]
}

export type AdminOverview = {
  viewerCapabilities: UserCapabilities
  users: AdminUserSummary[]
  feedback: AdminFeedback[]
  incidents: AdminIncident[]
  modelManagement: AdminManagedProvider[]
  selected: null | {
    userId: string
    state: PersistedChatState | null
    files: Array<SessionFile & { createdAt: string }>
    sessions: AdminSession[]
  }
}
