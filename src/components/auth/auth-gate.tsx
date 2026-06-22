import { useEffect, useState } from "react"
import type { AuthUser } from "@/lib/auth-types"
import { AuthScreen } from "@/components/auth/auth-screen"
import { VerifyEmailScreen } from "@/components/auth/verify-email-screen"
import { ChatApp } from "@/components/chat/chat-app"
import { Skeleton } from "@/components/ui/skeleton"

export function AuthGate() {
  const [verificationToken, setVerificationToken] = useState("")
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setVerificationToken(
      new URLSearchParams(window.location.search).get("verify")?.trim() ?? ""
    )
    let active = true
    fetch("/api/auth/session", { headers: { Accept: "application/json" } })
      .then(async (response) => {
        if (!response.ok) throw new Error()
        return response.json() as Promise<{ user: AuthUser | null }>
      })
      .then((payload) => {
        if (active) setUser(payload.user)
      })
      .catch(() => {
        if (active) setUser(null)
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  if (verificationToken) return <VerifyEmailScreen token={verificationToken} />

  if (loading) {
    return (
      <main className="grid min-h-svh place-items-center bg-background">
        <div className="flex w-full max-w-sm flex-col gap-4 px-6">
          <Skeleton className="h-12 w-32" />
          <Skeleton className="h-72 w-full" />
        </div>
      </main>
    )
  }

  if (!user) return <AuthScreen onAuthenticated={setUser} />
  return (
    <ChatApp
      user={user}
      onUserChange={setUser}
      onSignedOut={() => setUser(null)}
    />
  )
}
