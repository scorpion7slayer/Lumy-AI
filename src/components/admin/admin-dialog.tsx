import { useCallback, useEffect, useState } from "react"
import {
  ArrowLeft,
  Ban,
  CheckCircle2,
  Clock3,
  Download,
  FileText,
  LogOut,
  MessageSquare,
  RefreshCw,
  ShieldCheck,
  Trash2,
  UserCog,
} from "lucide-react"
import { toast } from "sonner"
import type { AdminOverview, AdminUserSummary } from "@/lib/admin-types"
import { MarkdownMessage } from "@/components/chat/markdown-message"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Spinner } from "@/components/ui/spinner"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"

type DeleteTarget = {
  type: "user" | "file" | "feedback" | "conversation" | "memory" | "session"
  id: string
  label: string
  userId?: string
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value))
}

async function adminRequest(url: string, init?: RequestInit) {
  const response = await fetch(url, init)
  if (response.status === 204) return null
  const payload = (await response.json().catch(() => ({}))) as {
    error?: string
  }
  if (!response.ok) throw new Error(payload.error ?? "Action admin impossible.")
  return payload
}

function UserStatus({ user }: { user: AdminUserSummary }) {
  return (
    <div className="flex flex-wrap gap-1">
      {user.role === "admin" ? <Badge>Admin</Badge> : null}
      <Badge variant={user.emailVerified ? "secondary" : "outline"}>
        {user.emailVerified ? "E-mail vérifié" : "Non vérifié"}
      </Badge>
      {user.disabled ? <Badge variant="destructive">Désactivé</Badge> : null}
    </div>
  )
}

export default function AdminDialog({
  open,
  onOpenChange,
  currentUserId,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  currentUserId: string
}) {
  const [overview, setOverview] = useState<AdminOverview | null>(null)
  const [selectedUserId, setSelectedUserId] = useState("")
  const [selectedConversationId, setSelectedConversationId] = useState("")
  const [loading, setLoading] = useState(false)
  const [acting, setActing] = useState(false)
  const [deleting, setDeleting] = useState<DeleteTarget | null>(null)

  const load = useCallback(async (userId?: string) => {
    setLoading(true)
    try {
      const suffix = userId ? `?userId=${encodeURIComponent(userId)}` : ""
      const response = await fetch(`/api/admin${suffix}`)
      const payload = (await response.json().catch(() => ({}))) as
        | AdminOverview
        | { error?: string }
      if (!response.ok || !("users" in payload)) {
        throw new Error(
          "error" in payload && payload.error
            ? payload.error
            : "Chargement admin impossible."
        )
      }
      setOverview(payload)
      setSelectedUserId(
        payload.selected?.userId ?? payload.users.at(0)?.id ?? ""
      )
      if (userId) setSelectedConversationId("")
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Chargement impossible."
      )
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (open) void load()
  }, [load, open])

  const patch = async (
    body: Record<string, unknown>,
    reloadUser = selectedUserId
  ) => {
    setActing(true)
    try {
      await adminRequest("/api/admin", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      await load(reloadUser)
      toast.success("Modification administrateur enregistrée.")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Action impossible.")
    } finally {
      setActing(false)
    }
  }

  const confirmDelete = async () => {
    if (!deleting) return
    setActing(true)
    try {
      if (deleting.type === "conversation" || deleting.type === "memory") {
        await adminRequest("/api/admin", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action:
              deleting.type === "conversation"
                ? "delete_conversation"
                : "delete_memory",
            userId: deleting.userId,
            resourceId: deleting.id,
          }),
        })
      } else {
        await adminRequest(
          `/api/admin?type=${deleting.type}&id=${encodeURIComponent(deleting.id)}`,
          { method: "DELETE" }
        )
      }
      const nextUser = deleting.type === "user" ? undefined : selectedUserId
      setDeleting(null)
      await load(nextUser)
      toast.success("Ressource supprimée.")
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Suppression impossible."
      )
    } finally {
      setActing(false)
    }
  }

  const selectedUser = overview?.users.find(
    (user) => user.id === selectedUserId
  )
  const state = overview?.selected?.state
  const files = overview?.selected?.files ?? []
  const sessions = overview?.selected?.sessions ?? []
  const selectedConversation = state?.conversations.find(
    (conversation) => conversation.id === selectedConversationId
  )

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="flex h-[min(900px,calc(100svh-2rem))] w-[calc(100vw-2rem)] max-w-6xl flex-col gap-0 overflow-hidden p-0">
          <DialogHeader className="shrink-0 bg-muted/35 px-5 py-4 sm:px-6 sm:py-5">
            <div className="flex items-center justify-between gap-4 pr-8">
              <div>
                <DialogTitle className="flex items-center gap-2 font-editorial text-2xl">
                  <ShieldCheck className="size-5 text-primary" />
                  Administration Lumy
                </DialogTitle>
                <DialogDescription className="mt-1">
                  Utilisateurs, conversations, mémoires, fichiers et feedback.
                </DialogDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => load(selectedUserId)}
                disabled={loading}
              >
                {loading ? <Spinner /> : <RefreshCw />}
                Actualiser
              </Button>
            </div>
          </DialogHeader>

          <Tabs
            defaultValue="users"
            className="min-h-0 flex-1 gap-0 overflow-hidden"
          >
            <div className="shrink-0 px-5 pt-4 sm:px-6">
              <TabsList className="w-fit">
                <TabsTrigger value="users">Utilisateurs</TabsTrigger>
                <TabsTrigger value="feedback">
                  Feedback
                  {overview?.feedback.some((item) => item.status === "new") ? (
                    <span className="ml-1 size-2 rounded-full bg-primary" />
                  ) : null}
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent
              value="users"
              className="min-h-0 flex-1 overflow-hidden p-0"
            >
              <div className="grid h-full min-h-0 grid-cols-[280px_minmax(0,1fr)] gap-3 p-3 max-md:grid-cols-1 max-md:grid-rows-[minmax(9rem,32%)_minmax(0,1fr)] sm:p-4">
                <ScrollArea className="rounded-xl bg-muted/35 max-md:min-h-0">
                  <div className="grid gap-1 p-3">
                    {overview?.users.map((user) => (
                      <button
                        type="button"
                        key={user.id}
                        className={cn(
                          "rounded-lg px-3 py-3 text-left hover:bg-muted",
                          selectedUserId === user.id && "bg-muted"
                        )}
                        onClick={() => {
                          setSelectedUserId(user.id)
                          setSelectedConversationId("")
                          void load(user.id)
                        }}
                      >
                        <span className="block truncate text-sm font-medium">
                          {user.name}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {user.email}
                        </span>
                        <span className="mt-2 block">
                          <UserStatus user={user} />
                        </span>
                      </button>
                    ))}
                  </div>
                </ScrollArea>

                <ScrollArea className="min-h-0 rounded-xl bg-background ring-1 ring-foreground/8">
                  {selectedUser ? (
                    <div className="grid gap-6 p-5">
                      <section className="rounded-xl border border-border p-4">
                        <div className="flex flex-wrap items-start justify-between gap-4">
                          <div>
                            <h3 className="text-lg font-semibold">
                              {selectedUser.name}
                            </h3>
                            <p className="text-sm text-muted-foreground">
                              {selectedUser.email}
                            </p>
                            <div className="mt-2">
                              <UserStatus user={selectedUser} />
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={
                                acting || selectedUser.id === currentUserId
                              }
                              onClick={() =>
                                patch({
                                  action: "set_role",
                                  userId: selectedUser.id,
                                  role:
                                    selectedUser.role === "admin"
                                      ? "user"
                                      : "admin",
                                })
                              }
                            >
                              <UserCog />
                              {selectedUser.role === "admin"
                                ? "Retirer admin"
                                : "Rendre admin"}
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={
                                acting || selectedUser.id === currentUserId
                              }
                              onClick={() =>
                                patch({
                                  action: "set_disabled",
                                  userId: selectedUser.id,
                                  disabled: !selectedUser.disabled,
                                })
                              }
                            >
                              {selectedUser.disabled ? (
                                <CheckCircle2 />
                              ) : (
                                <Ban />
                              )}
                              {selectedUser.disabled
                                ? "Réactiver"
                                : "Désactiver"}
                            </Button>
                            <Button
                              variant="destructive"
                              size="sm"
                              disabled={selectedUser.id === currentUserId}
                              onClick={() =>
                                setDeleting({
                                  type: "user",
                                  id: selectedUser.id,
                                  label: `le compte de ${selectedUser.name}`,
                                })
                              }
                            >
                              <Trash2 /> Supprimer
                            </Button>
                          </div>
                        </div>
                      </section>

                      <section>
                        {selectedConversation ? (
                          <div className="grid gap-4">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div className="min-w-0">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="mb-2 -ml-2"
                                  onClick={() => setSelectedConversationId("")}
                                >
                                  <ArrowLeft /> Toutes les conversations
                                </Button>
                                <h3 className="font-editorial text-xl [overflow-wrap:anywhere]">
                                  {selectedConversation.title}
                                </h3>
                                <p className="mt-1 text-xs text-muted-foreground">
                                  {selectedConversation.messages.length} message
                                  {selectedConversation.messages.length > 1
                                    ? "s"
                                    : ""}
                                  {" · "}
                                  Mise à jour le{" "}
                                  {formatDate(selectedConversation.updatedAt)}
                                </p>
                              </div>
                              <Button
                                variant="destructive"
                                size="sm"
                                onClick={() =>
                                  setDeleting({
                                    type: "conversation",
                                    id: selectedConversation.id,
                                    userId: selectedUser.id,
                                    label: `la conversation « ${selectedConversation.title} »`,
                                  })
                                }
                              >
                                <Trash2 /> Supprimer
                              </Button>
                            </div>
                            <div className="grid gap-3">
                              {selectedConversation.messages.map((message) => (
                                <article
                                  key={message.id}
                                  className={cn(
                                    "min-w-0 rounded-xl p-4",
                                    message.role === "user"
                                      ? "ml-auto w-[min(92%,48rem)] bg-primary/10"
                                      : "bg-muted/45"
                                  )}
                                >
                                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                                    <span className="font-semibold uppercase">
                                      {message.role === "user"
                                        ? "Utilisateur"
                                        : "Assistant"}
                                    </span>
                                    <span>{formatDate(message.createdAt)}</span>
                                  </div>
                                  {message.reasoning ? (
                                    <details className="mb-3 rounded-lg bg-background/70 p-3">
                                      <summary className="cursor-pointer text-xs font-medium">
                                        Réflexion du modèle
                                      </summary>
                                      <p className="mt-2 [overflow-wrap:anywhere] whitespace-pre-wrap text-muted-foreground">
                                        {message.reasoning}
                                      </p>
                                    </details>
                                  ) : null}
                                  <div className="min-w-0 [overflow-wrap:anywhere]">
                                    {message.role === "assistant" ? (
                                      <MarkdownMessage
                                        content={message.content}
                                      />
                                    ) : (
                                      <p className="whitespace-pre-wrap">
                                        {message.content}
                                      </p>
                                    )}
                                  </div>
                                  {message.modelId || message.responseTimeMs ? (
                                    <p className="mt-3 text-xs text-muted-foreground">
                                      {[
                                        message.modelId,
                                        message.firstTokenTimeMs
                                          ? `premier jeton ${(message.firstTokenTimeMs / 1_000).toFixed(1)} s`
                                          : null,
                                        message.reasoningTimeMs
                                          ? `réflexion ${(message.reasoningTimeMs / 1_000).toFixed(1)} s`
                                          : null,
                                        message.responseTimeMs
                                          ? `réponse ${(message.responseTimeMs / 1_000).toFixed(1)} s`
                                          : null,
                                      ]
                                        .filter(Boolean)
                                        .join(" · ")}
                                    </p>
                                  ) : null}
                                </article>
                              ))}
                            </div>
                          </div>
                        ) : (
                          <>
                            <h3 className="mb-3 flex items-center gap-2 font-semibold">
                              <MessageSquare className="size-4" /> Conversations
                              ({state?.conversations.length ?? 0})
                            </h3>
                            <div className="grid gap-2 sm:grid-cols-2">
                              {state?.conversations.map((conversation) => (
                                <button
                                  type="button"
                                  key={conversation.id}
                                  className="group rounded-xl bg-muted/40 p-4 text-left transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                                  onClick={() =>
                                    setSelectedConversationId(conversation.id)
                                  }
                                >
                                  <span className="block font-medium [overflow-wrap:anywhere]">
                                    {conversation.title}
                                  </span>
                                  <span className="mt-2 block text-xs text-muted-foreground">
                                    {conversation.messages.length} message
                                    {conversation.messages.length > 1
                                      ? "s"
                                      : ""}
                                    {" · "}
                                    {formatDate(conversation.updatedAt)}
                                  </span>
                                  <span className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-primary">
                                    Ouvrir la conversation
                                  </span>
                                </button>
                              ))}
                              {!state?.conversations.length ? (
                                <p className="text-sm text-muted-foreground">
                                  Aucune conversation.
                                </p>
                              ) : null}
                            </div>
                          </>
                        )}
                      </section>

                      <section>
                        <h3 className="mb-3 font-semibold">
                          Mémoires ({state?.memories.length ?? 0})
                        </h3>
                        <div className="grid gap-2">
                          {state?.memories.map((memory) => (
                            <div
                              key={memory.id}
                              className="flex items-start gap-3 rounded-lg border border-border p-3"
                            >
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium">
                                  {memory.title}
                                </p>
                                <p className="mt-1 text-sm [overflow-wrap:anywhere] text-muted-foreground">
                                  {memory.content}
                                </p>
                              </div>
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                aria-label={`Supprimer ${memory.title}`}
                                onClick={() =>
                                  setDeleting({
                                    type: "memory",
                                    id: memory.id,
                                    userId: selectedUser.id,
                                    label: `la mémoire « ${memory.title} »`,
                                  })
                                }
                              >
                                <Trash2 />
                              </Button>
                            </div>
                          ))}
                          {!state?.memories.length ? (
                            <p className="text-sm text-muted-foreground">
                              Aucune mémoire.
                            </p>
                          ) : null}
                        </div>
                      </section>

                      <section>
                        <h3 className="mb-3 flex items-center gap-2 font-semibold">
                          <FileText className="size-4" /> Fichiers (
                          {files.length})
                        </h3>
                        <div className="grid gap-2">
                          {files.map((file) => (
                            <div
                              key={file.id}
                              className="flex items-center gap-3 rounded-lg border border-border p-3"
                            >
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-medium">
                                  {file.name}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {file.type} ·{" "}
                                  {(file.size / 1_024).toLocaleString("fr-FR", {
                                    maximumFractionDigits: 1,
                                  })}{" "}
                                  Ko
                                </p>
                              </div>
                              <Button variant="outline" size="icon-sm" asChild>
                                <a
                                  href={`/api/admin/files/${encodeURIComponent(file.id)}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  aria-label={`Ouvrir ${file.name}`}
                                >
                                  <Download />
                                </a>
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                aria-label={`Supprimer ${file.name}`}
                                onClick={() =>
                                  setDeleting({
                                    type: "file",
                                    id: file.id,
                                    label: `le fichier « ${file.name} »`,
                                  })
                                }
                              >
                                <Trash2 />
                              </Button>
                            </div>
                          ))}
                          {!files.length ? (
                            <p className="text-sm text-muted-foreground">
                              Aucun fichier.
                            </p>
                          ) : null}
                        </div>
                      </section>

                      <section>
                        <h3 className="mb-1 flex items-center gap-2 font-semibold">
                          <Clock3 className="size-4" /> Sessions et cookies (
                          {sessions.length})
                        </h3>
                        <p className="mb-3 text-xs text-muted-foreground">
                          Les jetons de connexion restent masqués. Vous pouvez
                          révoquer une session active sans exposer son cookie.
                        </p>
                        <div className="grid gap-2">
                          {sessions.map((session, index) => (
                            <div
                              key={session.id}
                              className="flex flex-wrap items-center gap-3 rounded-lg bg-muted/40 p-3"
                            >
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium">
                                  Session {index + 1}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  Créée le {formatDate(session.createdAt)} ·
                                  expire le {formatDate(session.expiresAt)}
                                </p>
                              </div>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() =>
                                  setDeleting({
                                    type: "session",
                                    id: session.id,
                                    label: "cette session active",
                                  })
                                }
                              >
                                <LogOut /> Révoquer
                              </Button>
                            </div>
                          ))}
                          {!sessions.length ? (
                            <p className="text-sm text-muted-foreground">
                              Aucune session active.
                            </p>
                          ) : null}
                        </div>
                      </section>
                    </div>
                  ) : (
                    <div className="grid h-64 place-items-center text-sm text-muted-foreground">
                      {loading ? <Spinner /> : "Aucun utilisateur."}
                    </div>
                  )}
                </ScrollArea>
              </div>
            </TabsContent>

            <TabsContent
              value="feedback"
              className="min-h-0 flex-1 overflow-hidden p-0"
            >
              <ScrollArea className="h-full">
                <div className="grid gap-3 p-5">
                  {overview?.feedback.map((feedback) => (
                    <article
                      key={feedback.id}
                      className="rounded-xl border border-border p-4"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold">
                            {feedback.userName}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {feedback.userEmail}
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <Badge variant="outline">{feedback.category}</Badge>
                          <Badge>{feedback.status}</Badge>
                        </div>
                      </div>
                      <p className="mt-4 text-sm [overflow-wrap:anywhere] whitespace-pre-wrap">
                        {feedback.message}
                      </p>
                      <div className="mt-4 flex flex-wrap gap-2">
                        {feedback.status !== "resolved" ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              patch({
                                action: "feedback_status",
                                feedbackId: feedback.id,
                                status: "resolved",
                              })
                            }
                          >
                            <CheckCircle2 /> Marquer traité
                          </Button>
                        ) : null}
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            setDeleting({
                              type: "feedback",
                              id: feedback.id,
                              label: "ce feedback",
                            })
                          }
                        >
                          <Trash2 /> Supprimer
                        </Button>
                      </div>
                    </article>
                  ))}
                  {!overview?.feedback.length ? (
                    <p className="text-sm text-muted-foreground">
                      Aucun feedback reçu.
                    </p>
                  ) : null}
                </div>
              </ScrollArea>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      <ConfirmDeleteDialog
        open={Boolean(deleting)}
        onOpenChange={(isOpen) => {
          if (!isOpen) setDeleting(null)
        }}
        title="Confirmer la suppression"
        description={
          deleting
            ? `Supprimer définitivement ${deleting.label} ?`
            : "Cette ressource sera supprimée."
        }
        onConfirm={confirmDelete}
      />
    </>
  )
}
