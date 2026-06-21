import { useEffect, useState } from "react"
import {
  LogOut,
  Monitor,
  Moon,
  Save,
  Sparkles,
  Sun,
  Trash2,
} from "lucide-react"
import { useTheme } from "next-themes"
import { toast } from "sonner"
import type { AuthUser } from "@/lib/auth-types"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { Spinner } from "@/components/ui/spinner"

export function AccountSettingsDialog({
  open,
  onOpenChange,
  user,
  onUserChange,
  onSignedOut,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  user: AuthUser
  onUserChange: (user: AuthUser) => void
  onSignedOut: () => void
}) {
  const [name, setName] = useState(user.name)
  const [email, setEmail] = useState(user.email)
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [deletePassword, setDeletePassword] = useState("")
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [modelCount, setModelCount] = useState<number | null>(null)
  const [themeMounted, setThemeMounted] = useState(false)
  const { theme, setTheme } = useTheme()

  useEffect(() => {
    setName(user.name)
    setEmail(user.email)
  }, [user])

  useEffect(() => setThemeMounted(true), [])

  useEffect(() => {
    if (!open) return
    setModelCount(null)
    void fetch("/api/models")
      .then((response) => response.json() as Promise<{ models?: unknown[] }>)
      .then((payload) => setModelCount(payload.models?.length ?? 0))
      .catch(() => setModelCount(0))
  }, [open])

  const save = async () => {
    setSaving(true)
    try {
      const response = await fetch("/api/auth/account", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, currentPassword, newPassword }),
      })
      const payload = (await response.json().catch(() => ({}))) as {
        user?: AuthUser
        error?: string
      }
      if (!response.ok || !payload.user)
        throw new Error(payload.error ?? "Mise à jour impossible.")
      onUserChange(payload.user)
      setCurrentPassword("")
      setNewPassword("")
      toast.success("Compte mis à jour")
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Mise à jour impossible."
      )
    } finally {
      setSaving(false)
    }
  }

  const logout = async () => {
    const response = await fetch("/api/auth/session", { method: "DELETE" })
    if (!response.ok) {
      toast.error("Déconnexion impossible.")
      return
    }
    onSignedOut()
  }

  const changeTheme = (nextTheme: "light" | "dark" | "system") => {
    if (nextTheme === theme) return
    const root = document.documentElement
    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches
    const startViewTransition = (
      document as unknown as {
        startViewTransition?: (callback: () => Promise<void>) => {
          finished: Promise<void>
        }
      }
    ).startViewTransition?.bind(document)
    const applyTheme = async () => {
      setTheme(nextTheme)
      await new Promise<void>((resolve) => {
        window.requestAnimationFrame(() =>
          window.requestAnimationFrame(() => resolve())
        )
      })
    }

    root.classList.add("theme-transitioning")
    if (!prefersReducedMotion && startViewTransition) {
      const transition = startViewTransition(applyTheme)
      void transition.finished.finally(() =>
        root.classList.remove("theme-transitioning")
      )
      return
    }
    void applyTheme()
    window.setTimeout(() => root.classList.remove("theme-transitioning"), 320)
  }

  const deleteAccount = async (event: React.MouseEvent) => {
    event.preventDefault()
    setDeleting(true)
    try {
      const response = await fetch("/api/auth/account", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: deletePassword }),
      })
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as {
          error?: string
        }
        throw new Error(payload.error ?? "Suppression impossible.")
      }
      onOpenChange(false)
      window.localStorage.removeItem(`lumy.chat.v1:${user.id}`)
      onSignedOut()
      toast.success("Votre compte et ses données ont été supprimés.")
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Suppression impossible."
      )
    } finally {
      setDeleting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-[620px]">
        <DialogHeader>
          <DialogTitle className="font-editorial text-2xl">
            Mon compte
          </DialogTitle>
          <DialogDescription>
            Gérez votre identité, votre mot de passe et vos données Lumy.
          </DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="account-name">Nom</FieldLabel>
            <Input
              id="account-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoComplete="name"
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="account-email">Adresse e-mail</FieldLabel>
            <Input
              id="account-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
            />
          </Field>
          <Separator />
          <Field>
            <FieldLabel htmlFor="account-current-password">
              Mot de passe actuel
            </FieldLabel>
            <Input
              id="account-current-password"
              type="password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              autoComplete="current-password"
            />
            <FieldDescription>
              Requis pour changer l’e-mail ou le mot de passe.
            </FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="account-new-password">
              Nouveau mot de passe
            </FieldLabel>
            <Input
              id="account-new-password"
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              autoComplete="new-password"
              minLength={10}
            />
          </Field>
        </FieldGroup>
        <Separator />
        <section>
          <h3 className="text-sm font-medium">Apparence</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Choisissez l’affichage le plus confortable pour vous.
          </p>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {(
              [
                { value: "light", label: "Clair", icon: Sun },
                { value: "dark", label: "Sombre", icon: Moon },
                { value: "system", label: "Système", icon: Monitor },
              ] as const
            ).map((option) => {
              const Icon = option.icon
              return (
                <Button
                  key={option.value}
                  type="button"
                  variant={
                    themeMounted && theme === option.value
                      ? "secondary"
                      : "outline"
                  }
                  className="h-auto flex-col gap-2 py-3"
                  onClick={() => changeTheme(option.value)}
                  aria-pressed={themeMounted && theme === option.value}
                >
                  <Icon className="size-4" />
                  {option.label}
                </Button>
              )
            })}
          </div>
        </section>
        <Separator />
        <section className="flex items-start gap-3">
          <Sparkles className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <div>
            <h3 className="text-sm font-medium">Modèles</h3>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              {modelCount === null
                ? "Détection en cours…"
                : modelCount > 0
                  ? `${modelCount} modèle${modelCount > 1 ? "s" : ""} disponible${modelCount > 1 ? "s" : ""}.`
                  : "Aucun modèle détecté. Une clé API valide est nécessaire pour utiliser le chat."}
            </p>
          </div>
        </section>
        <Separator />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button variant="outline" onClick={logout}>
            <LogOut data-icon="inline-start" />
            Se déconnecter
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive">
                <Trash2 data-icon="inline-start" />
                Supprimer mon compte
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  Supprimer définitivement le compte ?
                </AlertDialogTitle>
                <AlertDialogDescription>
                  Toutes les conversations, mémoires, sessions et fichiers
                  seront supprimés. Cette action est irréversible.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <Field>
                <FieldLabel htmlFor="delete-password">
                  Confirmez avec votre mot de passe
                </FieldLabel>
                <Input
                  id="delete-password"
                  type="password"
                  value={deletePassword}
                  onChange={(event) => setDeletePassword(event.target.value)}
                  autoComplete="current-password"
                />
              </Field>
              <AlertDialogFooter>
                <AlertDialogCancel>Annuler</AlertDialogCancel>
                <AlertDialogAction
                  variant="destructive"
                  onClick={deleteAccount}
                  disabled={!deletePassword || deleting}
                >
                  {deleting ? (
                    <Spinner data-icon="inline-start" />
                  ) : (
                    <Trash2 data-icon="inline-start" />
                  )}
                  Supprimer définitivement
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Fermer
          </Button>
          <Button
            onClick={save}
            disabled={saving || !name.trim() || !email.trim()}
          >
            {saving ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <Save data-icon="inline-start" />
            )}
            Enregistrer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
