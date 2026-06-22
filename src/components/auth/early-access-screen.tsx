import { Clock3, LogOut, RefreshCw, ShieldCheck } from "lucide-react"
import type { AuthUser } from "@/lib/auth-types"
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

type EarlyAccessStatus = "pending" | "rejected"

export function EarlyAccessScreen({
  user,
  status,
  refreshing,
  requesting,
  requestConfirmed,
  signingOut,
  error,
  onRefresh,
  onSignOut,
}: {
  user: Pick<AuthUser, "name" | "email">
  status: EarlyAccessStatus
  refreshing: boolean
  requesting: boolean
  requestConfirmed: boolean
  signingOut: boolean
  error?: string
  onRefresh: () => void
  onSignOut: () => void
}) {
  const rejected = status === "rejected"

  return (
    <main className="grid min-h-svh place-items-center bg-background p-6">
      <Card className="w-full max-w-lg border-border/80">
        <CardHeader>
          <div className="mb-5">
            <LumyLogo className="h-12 w-40" />
            <PoweredByZyranex className="mt-1" />
          </div>
          <div className="mb-3 grid size-11 place-items-center rounded-xl bg-primary/10 text-primary">
            {rejected ? (
              <ShieldCheck className="size-5" />
            ) : (
              <Clock3 className="size-5" />
            )}
          </div>
          <CardTitle className="font-editorial text-3xl">
            {rejected ? "Accès non accordé" : "Demande en attente"}
          </CardTitle>
          <CardDescription className="text-sm leading-6">
            {rejected
              ? "Votre demande d’accès anticipé n’a pas été retenue pour le moment."
              : requesting
                ? "Lumy transmet votre demande d’accès anticipé à l’administrateur."
                : requestConfirmed
                  ? "Votre demande d’accès anticipé a bien été reçue. Un administrateur doit maintenant l’accepter."
                  : "Votre demande doit être transmise à l’administrateur avant de rejoindre la liste d’attente."}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5">
          <div className="rounded-xl bg-muted/55 p-4">
            <p className="text-sm font-medium">{user.name}</p>
            <p className="mt-1 text-xs break-all text-muted-foreground">
              {user.email}
            </p>
          </div>
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          <p className="text-sm leading-6 text-muted-foreground">
            {rejected
              ? "Vous pouvez vérifier à nouveau votre statut plus tard."
              : requestConfirmed
                ? "Vous pourrez ouvrir Lumy dès que votre demande sera acceptée. Aucun nouvel e-mail ni nouvelle inscription n’est nécessaire."
                : "Réessayez pour transmettre la demande et vérifier votre statut."}
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              className="flex-1"
              onClick={onRefresh}
              disabled={refreshing || requesting || signingOut}
            >
              {refreshing || requesting ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <RefreshCw data-icon="inline-start" />
              )}
              {rejected || requestConfirmed
                ? "Vérifier mon accès"
                : "Envoyer ma demande"}
            </Button>
            <Button
              variant="outline"
              onClick={onSignOut}
              disabled={refreshing || requesting || signingOut}
            >
              {signingOut ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <LogOut data-icon="inline-start" />
              )}
              Se déconnecter
            </Button>
          </div>
        </CardContent>
      </Card>
    </main>
  )
}
