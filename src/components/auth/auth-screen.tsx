import { useState } from "react"
import {
  ArrowRight,
  Check,
  Eye,
  EyeOff,
  LockKeyhole,
  Sparkles,
} from "lucide-react"
import type { AuthUser } from "@/lib/auth-types"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

async function authRequest(path: string, body: Record<string, string>) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  const payload = (await response.json().catch(() => ({}))) as {
    user?: AuthUser
    error?: string
  }
  if (!response.ok || !payload.user)
    throw new Error(payload.error ?? "Authentification impossible.")
  return payload.user
}

function PasswordField({
  id,
  value,
  onChange,
  label = "Mot de passe",
  autoComplete,
}: {
  id: string
  value: string
  onChange: (value: string) => void
  label?: string
  autoComplete: string
}) {
  const [visible, setVisible] = useState(false)
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <div className="relative">
        <Input
          id={id}
          type={visible ? "text" : "password"}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          autoComplete={autoComplete}
          minLength={10}
          required
          className="pr-10"
        />
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="absolute top-1/2 right-1 -translate-y-1/2"
          onClick={() => setVisible((current) => !current)}
          aria-label={
            visible ? "Masquer le mot de passe" : "Afficher le mot de passe"
          }
        >
          {visible ? <EyeOff /> : <Eye />}
        </Button>
      </div>
    </Field>
  )
}

export function AuthScreen({
  onAuthenticated,
}: {
  onAuthenticated: (user: AuthUser) => void
}) {
  const [mode, setMode] = useState("login")
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [pending, setPending] = useState(false)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError("")
    setPending(true)
    try {
      const path =
        mode === "register" ? "/api/auth/register" : "/api/auth/login"
      const user = await authRequest(path, { name, email, password })
      onAuthenticated(user)
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Authentification impossible."
      )
    } finally {
      setPending(false)
    }
  }

  return (
    <main className="grid min-h-svh bg-background lg:grid-cols-[minmax(0,1fr)_560px]">
      <section className="relative hidden overflow-hidden border-r border-border bg-sidebar p-14 lg:flex lg:flex-col lg:justify-between">
        <div className="flex items-center gap-3">
          <div className="grid size-11 place-items-center rounded-lg bg-primary font-editorial text-xl text-primary-foreground">
            L
          </div>
          <span className="font-editorial text-4xl tracking-[-0.04em]">
            Lumy
          </span>
        </div>
        <div className="max-w-xl">
          <Sparkles className="mb-7 size-8 text-primary" />
          <h1 className="font-editorial text-5xl leading-[1.08] font-semibold tracking-[-0.035em]">
            Votre espace IA, avec une mémoire qui vous appartient.
          </h1>
          <p className="mt-6 max-w-lg text-base leading-7 text-muted-foreground">
            Choisissez librement vos modèles OpenRouter, Kilo Code, OpenCode ou
            NVIDIA NIM, conservez votre historique et contrôlez exactement ce
            que Lumy retient.
          </p>
          <div className="mt-9 flex flex-col gap-3 text-sm">
            {[
              "Vos conversations restent liées à votre compte",
              "Vous choisissez ce que Lumy peut mémoriser",
              "Vos données sont supprimables à tout moment",
            ].map((item) => (
              <div key={item} className="flex items-center gap-3">
                <span className="grid size-6 place-items-center rounded-full bg-primary/10 text-primary">
                  <Check className="size-3.5" />
                </span>
                {item}
              </div>
            ))}
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Un espace privé pour vos conversations.
        </p>
      </section>

      <section className="flex items-center justify-center p-6 sm:p-10">
        <Card className="w-full max-w-md border-border/80 shadow-[0_18px_55px_rgba(49,45,36,0.08)]">
          <CardHeader>
            <div className="mb-4 flex items-center gap-3 lg:hidden">
              <div className="grid size-9 place-items-center rounded-lg bg-primary font-editorial text-primary-foreground">
                L
              </div>
              <span className="font-editorial text-3xl">Lumy</span>
            </div>
            <CardTitle className="font-editorial text-3xl">Bienvenue</CardTitle>
            <CardDescription>
              Connectez-vous ou créez votre espace personnel.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs
              value={mode}
              onValueChange={(value) => {
                setMode(value)
                setError("")
              }}
            >
              <TabsList className="mb-6 w-full">
                <TabsTrigger value="login">Connexion</TabsTrigger>
                <TabsTrigger value="register">Créer un compte</TabsTrigger>
              </TabsList>
              <form onSubmit={submit}>
                <FieldGroup>
                  <TabsContent value="register" className="m-0">
                    <Field>
                      <FieldLabel htmlFor="auth-name">Nom</FieldLabel>
                      <Input
                        id="auth-name"
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                        autoComplete="name"
                        minLength={2}
                        required={mode === "register"}
                      />
                    </Field>
                  </TabsContent>
                  <Field>
                    <FieldLabel htmlFor="auth-email">Adresse e-mail</FieldLabel>
                    <Input
                      id="auth-email"
                      type="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      autoComplete="email"
                      required
                    />
                  </Field>
                  <PasswordField
                    id="auth-password"
                    value={password}
                    onChange={setPassword}
                    autoComplete={
                      mode === "register" ? "new-password" : "current-password"
                    }
                  />
                  {mode === "register" ? (
                    <p className="text-xs leading-5 text-muted-foreground">
                      Utilisez au moins 10 caractères.
                    </p>
                  ) : null}
                  {error ? (
                    <Alert variant="destructive">
                      <LockKeyhole />
                      <AlertDescription>{error}</AlertDescription>
                    </Alert>
                  ) : null}
                  <Button
                    type="submit"
                    size="lg"
                    className="w-full"
                    disabled={pending}
                  >
                    {pending ? (
                      <Spinner data-icon="inline-start" />
                    ) : (
                      <ArrowRight data-icon="inline-end" />
                    )}
                    {pending
                      ? "Veuillez patienter…"
                      : mode === "register"
                        ? "Créer mon espace"
                        : "Se connecter"}
                  </Button>
                </FieldGroup>
              </form>
            </Tabs>
          </CardContent>
          <CardFooter>
            <p className="text-xs leading-5 text-muted-foreground">
              En continuant, vous acceptez que Lumy stocke vos données dans la
              base configurée par l’administrateur.
            </p>
          </CardFooter>
        </Card>
      </section>
    </main>
  )
}
