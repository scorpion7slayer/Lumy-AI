import { useState } from "react"
import { CheckCircle2, MailCheck } from "lucide-react"
import { LumyLogo, PoweredByZyranex } from "@/components/lumy-logo"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Spinner } from "@/components/ui/spinner"

export function VerifyEmailScreen({ token }: { token: string }) {
  const [pending, setPending] = useState(false)
  const [verified, setVerified] = useState(false)
  const [error, setError] = useState("")

  const verify = async () => {
    setPending(true)
    setError("")
    try {
      const response = await fetch("/api/auth/email-verification", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      })
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string
      }
      if (!response.ok)
        throw new Error(payload.error ?? "Vérification impossible.")
      setVerified(true)
      window.history.replaceState({}, "", "/")
    } catch (verificationError) {
      setError(
        verificationError instanceof Error
          ? verificationError.message
          : "Vérification impossible."
      )
    } finally {
      setPending(false)
    }
  }

  return (
    <main className="grid min-h-svh place-items-center bg-background p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <LumyLogo className="mb-4 h-12 w-40" />
          <PoweredByZyranex className="-mt-4 mb-4" />
          <CardTitle className="font-editorial text-3xl">
            {verified ? "Adresse vérifiée" : "Vérification de l’e-mail"}
          </CardTitle>
          <CardDescription>
            {verified
              ? "Votre adresse est confirmée et votre session est ouverte."
              : "Confirmez que cette adresse e-mail vous appartient pour accéder à Lumy."}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          {verified ? (
            <>
              <CheckCircle2 className="size-10 text-emerald-600" />
              <Button onClick={() => window.location.replace("/")}>
                Ouvrir Lumy
              </Button>
            </>
          ) : (
            <Button size="lg" onClick={verify} disabled={pending}>
              {pending ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <MailCheck data-icon="inline-start" />
              )}
              Vérifier mon e-mail
            </Button>
          )}
        </CardContent>
      </Card>
    </main>
  )
}
