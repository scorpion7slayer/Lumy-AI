import type { PersistedChatState, SessionFile } from "@/lib/chat-types"

export type AdminUserSummary = {
  id: string
  email: string
  name: string
  role: "user" | "admin"
  emailVerified: boolean
  disabled: boolean
  createdAt: string
  fileCount: number
  feedbackCount: number
  sessionCount: number
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

export type AdminOverview = {
  users: AdminUserSummary[]
  feedback: AdminFeedback[]
  selected: null | {
    userId: string
    state: PersistedChatState | null
    files: Array<SessionFile & { createdAt: string }>
    sessions: AdminSession[]
  }
}
