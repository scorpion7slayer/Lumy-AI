import { useCallback, useEffect, useState } from "react"
import type { AuthUser } from "@/lib/auth-types"
import { EarlyAccessScreen } from "@/components/auth/early-access-screen"
import { AuthScreen } from "@/components/auth/auth-screen"
import { VerifyEmailScreen } from "@/components/auth/verify-email-screen"
import { ChatApp } from "@/components/chat/chat-app"
import { Skeleton } from "@/components/ui/skeleton"

export function AuthGate() {
  const [verificationToken, setVerificationToken] = useState("")
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [requestingAccess, setRequestingAccess] = useState(false)
  const [requestConfirmed, setRequestConfirmed] = useState(false)
  const [requestAttempted, setRequestAttempted] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const [accessError, setAccessError] = useState("")

  const loadSession = async () => {
    const response = await fetch("/api/auth/session", {
      headers: { Accept: "application/json" },
    })
    if (!response.ok) throw new Error("Impossible de vérifier votre accès.")
    const payload = (await response.json()) as { user: AuthUser | null }
    setUser(payload.user)
    return payload.user
  }

  const requestEarlyAccess = useCallback(async () => {
    setRequestAttempted(true)
    setRequestingAccess(true)
    setAccessError("")
    try {
      const response = await fetch("/api/early-access", {
        method: "POST",
        headers: { Accept: "application/json" },
      })
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string
      }
      if (!response.ok) {
        throw new Error(
          payload.error ?? "Impossible de transmettre votre demande."
        )
      }
      setRequestConfirmed(true)
      return true
    } catch (error) {
      setRequestConfirmed(false)
      setAccessError(
        error instanceof Error
          ? error.message
          : "Impossible de transmettre votre demande."
      )
      return false
    } finally {
      setRequestingAccess(false)
    }
  }, [])

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

  useEffect(() => {
    if (
      !user ||
      user.accessStatus !== "pending" ||
      user.capabilities.appAccess ||
      user.capabilities.adminAccess ||
      requestConfirmed ||
      requestAttempted ||
      requestingAccess
    ) {
      return
    }
    void requestEarlyAccess()
  }, [
    requestAttempted,
    requestConfirmed,
    requestEarlyAccess,
    requestingAccess,
    user,
  ])

  const refreshAccess = async () => {
    setRefreshing(true)
    setAccessError("")
    try {
      if (user?.accessStatus === "pending") {
        const requested = await requestEarlyAccess()
        if (!requested) return
      }
      await loadSession()
    } catch (error) {
      setAccessError(
        error instanceof Error
          ? error.message
          : "Impossible de vérifier votre accès."
      )
    } finally {
      setRefreshing(false)
    }
  }

  const signOut = async () => {
    setSigningOut(true)
    setAccessError("")
    try {
      const response = await fetch("/api/auth/session", { method: "DELETE" })
      if (!response.ok) throw new Error("Déconnexion impossible.")
      setUser(null)
    } catch (error) {
      setAccessError(
        error instanceof Error ? error.message : "Déconnexion impossible."
      )
    } finally {
      setSigningOut(false)
    }
  }

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
  if (
    !user.capabilities.appAccess &&
    !user.capabilities.adminAccess &&
    (user.accessStatus === "pending" || user.accessStatus === "rejected")
  ) {
    return (
      <EarlyAccessScreen
        user={user}
        status={user.accessStatus}
        refreshing={refreshing}
        requesting={requestingAccess}
        requestConfirmed={requestConfirmed}
        signingOut={signingOut}
        error={accessError}
        onRefresh={() => void refreshAccess()}
        onSignOut={() => void signOut()}
      />
    )
  }
  return (
    <ChatApp
      user={user}
      onUserChange={setUser}
      onSignedOut={() => setUser(null)}
    />
  )
}
