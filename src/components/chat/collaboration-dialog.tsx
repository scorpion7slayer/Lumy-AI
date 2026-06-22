import { useCallback, useEffect, useState } from "react"
import {
  Bell,
  Check,
  Headphones,
  Megaphone,
  Plus,
  Send,
  UserPlus,
  Users,
  X,
} from "lucide-react"
import { toast } from "sonner"
import type { AuthUser } from "@/lib/auth-types"
import type { AdminOverview } from "@/lib/admin-types"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"

type NotificationItem = {
  id: string
  type: string
  title: string
  body: string
  targetUrl: string | null
  readAt: string | null
  createdAt: string
}

type Announcement = {
  id: string
  title: string
  body: string
  kind: "welcome" | "changelog" | "maintenance" | "general"
  publishedAt: string
}

type Group = {
  id: string
  title: string
  ownerUserId: string
  role: "owner" | "member"
  memberCount: number
  updatedAt: string
}

type SharedMessage = {
  id: string
  authorUserId: string
  authorName: string
  authorIsAdmin?: boolean
  content: string
  createdAt: string
}

type SupportTicket = {
  id: string
  requesterUserId: string
  requesterName: string
  requesterEmail?: string
  subject: string
  status: "open" | "in_progress" | "closed"
  assignedAdminId: string | null
  pendingHandoffAdminId: string | null
  createdAt: string
  updatedAt: string
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init)
  const payload = (await response.json().catch(() => ({}))) as T & {
    error?: string
  }
  if (!response.ok) throw new Error(payload.error ?? "Action impossible.")
  return payload
}

function date(value: string) {
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value))
}

export function CollaborationDialog({
  open,
  onOpenChange,
  user,
  initialTab = "support",
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  user: AuthUser
  initialTab?: "support" | "groups" | "announcements" | "notifications"
}) {
  const [notifications, setNotifications] = useState<NotificationItem[]>([])
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [groups, setGroups] = useState<Group[]>([])
  const [tickets, setTickets] = useState<SupportTicket[]>([])
  const [admins, setAdmins] = useState<AdminOverview["users"]>([])
  const [selectedGroupId, setSelectedGroupId] = useState("")
  const [selectedTicketId, setSelectedTicketId] = useState("")
  const [groupMessages, setGroupMessages] = useState<SharedMessage[]>([])
  const [supportMessages, setSupportMessages] = useState<SharedMessage[]>([])
  const [busy, setBusy] = useState(false)
  const [newGroupTitle, setNewGroupTitle] = useState("")
  const [inviteEmail, setInviteEmail] = useState("")
  const [groupMessage, setGroupMessage] = useState("")
  const [ticketSubject, setTicketSubject] = useState("")
  const [ticketMessage, setTicketMessage] = useState("")
  const [supportMessage, setSupportMessage] = useState("")
  const [handoffAdminId, setHandoffAdminId] = useState("")
  const [announcementTitle, setAnnouncementTitle] = useState("")
  const [announcementBody, setAnnouncementBody] = useState("")

  const load = useCallback(async () => {
    const [notificationData, announcementData, groupData, supportData] =
      await Promise.all([
        api<{ notifications: NotificationItem[] }>("/api/notifications"),
        api<{ announcements: Announcement[] }>("/api/announcements"),
        api<{ groups: Group[] }>("/api/groups"),
        api<{ tickets: SupportTicket[] }>("/api/support"),
      ])
    setNotifications(notificationData.notifications)
    setAnnouncements(announcementData.announcements)
    setGroups(groupData.groups)
    setTickets(supportData.tickets)
    if (user.capabilities.adminAccess) {
      const adminData = await api<AdminOverview>("/api/admin")
      setAdmins(adminData.users)
    }
  }, [user.capabilities.adminAccess])

  const loadGroupMessages = useCallback(async (groupId: string) => {
    if (!groupId) return setGroupMessages([])
    const data = await api<{ messages: SharedMessage[] }>(
      `/api/group-messages?groupId=${encodeURIComponent(groupId)}`
    )
    setGroupMessages(data.messages)
  }, [])

  const loadSupportMessages = useCallback(async (ticketId: string) => {
    if (!ticketId) return setSupportMessages([])
    const data = await api<{ messages: SharedMessage[] }>(
      `/api/support?ticketId=${encodeURIComponent(ticketId)}`
    )
    setSupportMessages(data.messages)
  }, [])

  useEffect(() => {
    if (!open) return
    void load().catch((error) =>
      toast.error(
        error instanceof Error ? error.message : "Chargement impossible."
      )
    )
    const timer = window.setInterval(() => {
      void load()
      if (selectedGroupId) void loadGroupMessages(selectedGroupId)
      if (selectedTicketId) void loadSupportMessages(selectedTicketId)
    }, 10_000)
    return () => window.clearInterval(timer)
  }, [
    load,
    loadGroupMessages,
    loadSupportMessages,
    open,
    selectedGroupId,
    selectedTicketId,
  ])

  useEffect(() => {
    if (!open) return
    const params = new URLSearchParams(window.location.search)
    const supportTicket =
      params.get("support") ?? params.get("supportTicket") ?? ""
    const group = params.get("group") ?? ""
    if (supportTicket) {
      setSelectedTicketId(supportTicket)
      void loadSupportMessages(supportTicket)
    }
    if (group) {
      setSelectedGroupId(group)
      void loadGroupMessages(group)
    }
    const token = params.get("groupInvite")
    if (!token) return
    const accept = window.confirm(
      "Accepter l’invitation à cette conversation de groupe ?"
    )
    void api<{ groupId?: string }>("/api/group-invitations", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, action: accept ? "accept" : "decline" }),
    })
      .then(async (result) => {
        window.history.replaceState({}, "", window.location.pathname)
        if (result.groupId) setSelectedGroupId(result.groupId)
        await load()
        toast.success(accept ? "Invitation acceptée." : "Invitation refusée.")
      })
      .catch((error) =>
        toast.error(
          error instanceof Error ? error.message : "Invitation invalide."
        )
      )
  }, [load, loadGroupMessages, loadSupportMessages, open])

  const action = async (callback: () => Promise<unknown>, success: string) => {
    setBusy(true)
    try {
      await callback()
      await load()
      toast.success(success)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Action impossible.")
    } finally {
      setBusy(false)
    }
  }

  const selectedGroup = groups.find((group) => group.id === selectedGroupId)
  const selectedTicket = tickets.find(
    (ticket) => ticket.id === selectedTicketId
  )
  const canWriteSupport = Boolean(
    selectedTicket &&
    selectedTicket.status !== "closed" &&
    (!user.capabilities.adminAccess ||
      selectedTicket.assignedAdminId === user.id)
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[min(860px,calc(100svh-2rem))] w-[calc(100vw-2rem)] max-w-5xl flex-col overflow-hidden p-0">
        <DialogHeader className="border-b border-border px-5 py-4 pr-12">
          <DialogTitle className="font-editorial text-2xl">
            Centre Lumy
          </DialogTitle>
          <DialogDescription>
            Assistance en direct, groupes, annonces et notifications.
          </DialogDescription>
        </DialogHeader>
        <Tabs defaultValue={initialTab} className="min-h-0 flex-1 gap-0">
          <TabsList className="mx-5 mt-3 max-w-[calc(100%-2.5rem)] justify-start overflow-x-auto">
            <TabsTrigger value="support">
              <Headphones /> Assistance
            </TabsTrigger>
            <TabsTrigger value="groups">
              <Users /> Groupes
            </TabsTrigger>
            <TabsTrigger value="announcements">
              <Megaphone /> Annonces
            </TabsTrigger>
            <TabsTrigger value="notifications">
              <Bell /> Notifications
              {notifications.some((item) => !item.readAt) ? (
                <span className="size-2 rounded-full bg-destructive" />
              ) : null}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="support" className="min-h-0 flex-1 p-4">
            <div className="grid h-full min-h-0 grid-cols-[280px_minmax(0,1fr)] gap-3 max-md:grid-cols-1 max-md:grid-rows-[auto_minmax(0,1fr)]">
              <ScrollArea className="rounded-xl bg-muted/35">
                <div className="grid gap-2 p-3">
                  {!user.capabilities.adminAccess &&
                  !tickets.some((ticket) => ticket.status !== "closed") ? (
                    <form
                      className="grid gap-2 rounded-lg border border-border bg-background p-3"
                      onSubmit={(event) => {
                        event.preventDefault()
                        void action(async () => {
                          const result = await api<{ ticketId: string }>(
                            "/api/support",
                            {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({
                                action: "create",
                                subject: ticketSubject,
                                message: ticketMessage,
                              }),
                            }
                          )
                          setSelectedTicketId(result.ticketId)
                          setTicketSubject("")
                          setTicketMessage("")
                        }, "Ticket ouvert. Les administrateurs ont été prévenus.")
                      }}
                    >
                      <p className="text-sm font-semibold">Nouveau ticket</p>
                      <Input
                        value={ticketSubject}
                        onChange={(event) =>
                          setTicketSubject(event.target.value)
                        }
                        placeholder="Sujet"
                      />
                      <Textarea
                        value={ticketMessage}
                        onChange={(event) =>
                          setTicketMessage(event.target.value)
                        }
                        placeholder="Décrivez le problème…"
                      />
                      <Button size="sm" disabled={busy}>
                        <Plus /> Ouvrir
                      </Button>
                    </form>
                  ) : null}
                  {tickets.map((ticket) => (
                    <button
                      key={ticket.id}
                      type="button"
                      className={cn(
                        "rounded-lg p-3 text-left hover:bg-muted",
                        ticket.id === selectedTicketId && "bg-muted"
                      )}
                      onClick={() => {
                        setSelectedTicketId(ticket.id)
                        void loadSupportMessages(ticket.id)
                      }}
                    >
                      <span className="block truncate text-sm font-medium">
                        {ticket.subject}
                      </span>
                      <span className="mt-1 block text-xs text-muted-foreground">
                        {ticket.requesterName} · {date(ticket.updatedAt)}
                      </span>
                      <Badge className="mt-2" variant="outline">
                        {ticket.status === "closed"
                          ? "Fermé"
                          : ticket.assignedAdminId
                            ? "Pris en charge"
                            : "Ouvert"}
                      </Badge>
                    </button>
                  ))}
                </div>
              </ScrollArea>
              <div className="flex min-h-0 flex-col rounded-xl border border-border">
                {selectedTicket ? (
                  <>
                    <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">
                          {selectedTicket.subject}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {selectedTicket.requesterName}
                        </p>
                      </div>
                      {user.capabilities.adminAccess &&
                      !selectedTicket.assignedAdminId ? (
                        <Button
                          size="sm"
                          onClick={() =>
                            void action(
                              () =>
                                api("/api/support", {
                                  method: "PATCH",
                                  headers: {
                                    "Content-Type": "application/json",
                                  },
                                  body: JSON.stringify({
                                    action: "claim",
                                    ticketId: selectedTicket.id,
                                  }),
                                }),
                              "Vous avez rejoint le ticket."
                            )
                          }
                        >
                          <Check /> Rejoindre
                        </Button>
                      ) : null}
                      {selectedTicket.pendingHandoffAdminId === user.id ? (
                        <Button
                          size="sm"
                          onClick={() =>
                            void action(
                              () =>
                                api("/api/support", {
                                  method: "PATCH",
                                  headers: {
                                    "Content-Type": "application/json",
                                  },
                                  body: JSON.stringify({
                                    action: "accept_handoff",
                                    ticketId: selectedTicket.id,
                                  }),
                                }),
                              "Transfert accepté."
                            )
                          }
                        >
                          Accepter le transfert
                        </Button>
                      ) : null}
                      {selectedTicket.status !== "closed" ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            void action(
                              () =>
                                api("/api/support", {
                                  method: "PATCH",
                                  headers: {
                                    "Content-Type": "application/json",
                                  },
                                  body: JSON.stringify({
                                    action: "close",
                                    ticketId: selectedTicket.id,
                                  }),
                                }),
                              "Ticket fermé."
                            )
                          }
                        >
                          <X /> Fermer
                        </Button>
                      ) : null}
                    </div>
                    <ScrollArea className="min-h-0 flex-1">
                      <div className="grid gap-3 p-4">
                        {supportMessages.map((message) => (
                          <article
                            key={message.id}
                            className={cn(
                              "max-w-[85%] rounded-xl p-3 text-sm",
                              message.authorUserId === user.id
                                ? "ml-auto bg-primary text-primary-foreground"
                                : "bg-muted"
                            )}
                          >
                            <p className="mb-1 text-xs font-semibold opacity-70">
                              {message.authorName}
                              {message.authorIsAdmin ? " · Administration" : ""}
                            </p>
                            <p className="whitespace-pre-wrap">
                              {message.content}
                            </p>
                          </article>
                        ))}
                      </div>
                    </ScrollArea>
                    {canWriteSupport ? (
                      <form
                        className="flex gap-2 border-t border-border p-3"
                        onSubmit={(event) => {
                          event.preventDefault()
                          const content = supportMessage.trim()
                          if (!content) return
                          void action(async () => {
                            await api("/api/support", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({
                                action: "message",
                                ticketId: selectedTicket.id,
                                message: content,
                              }),
                            })
                            setSupportMessage("")
                            await loadSupportMessages(selectedTicket.id)
                          }, "Message envoyé.")
                        }}
                      >
                        <Input
                          value={supportMessage}
                          onChange={(event) =>
                            setSupportMessage(event.target.value)
                          }
                          placeholder="Votre message…"
                        />
                        <Button
                          size="icon"
                          disabled={busy}
                          aria-label="Envoyer"
                        >
                          <Send />
                        </Button>
                      </form>
                    ) : null}
                    {user.capabilities.adminAccess &&
                    selectedTicket.assignedAdminId === user.id &&
                    selectedTicket.status !== "closed" ? (
                      <div className="flex gap-2 border-t border-border p-3">
                        <select
                          className="h-9 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-sm"
                          value={handoffAdminId}
                          onChange={(event) =>
                            setHandoffAdminId(event.target.value)
                          }
                        >
                          <option value="">Transférer à…</option>
                          {admins
                            .filter(
                              (admin) =>
                                admin.role === "admin" && admin.id !== user.id
                            )
                            .map((admin) => (
                              <option key={admin.id} value={admin.id}>
                                {admin.name}
                              </option>
                            ))}
                        </select>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={!handoffAdminId || busy}
                          onClick={() =>
                            void action(
                              () =>
                                api("/api/support", {
                                  method: "PATCH",
                                  headers: {
                                    "Content-Type": "application/json",
                                  },
                                  body: JSON.stringify({
                                    action: "handoff",
                                    ticketId: selectedTicket.id,
                                    targetAdminUserId: handoffAdminId,
                                  }),
                                }),
                              "Transfert proposé."
                            )
                          }
                        >
                          Transférer
                        </Button>
                      </div>
                    ) : null}
                  </>
                ) : (
                  <div className="grid flex-1 place-items-center p-6 text-sm text-muted-foreground">
                    Sélectionnez un ticket.
                  </div>
                )}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="groups" className="min-h-0 flex-1 p-4">
            <div className="grid h-full min-h-0 grid-cols-[280px_minmax(0,1fr)] gap-3 max-md:grid-cols-1 max-md:grid-rows-[auto_minmax(0,1fr)]">
              <ScrollArea className="rounded-xl bg-muted/35">
                <div className="grid gap-2 p-3">
                  <form
                    className="flex gap-2"
                    onSubmit={(event) => {
                      event.preventDefault()
                      if (!newGroupTitle.trim()) return
                      void action(async () => {
                        const result = await api<{ id: string }>(
                          "/api/groups",
                          {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ title: newGroupTitle }),
                          }
                        )
                        setSelectedGroupId(result.id)
                        setNewGroupTitle("")
                      }, "Groupe créé.")
                    }}
                  >
                    <Input
                      value={newGroupTitle}
                      onChange={(event) => setNewGroupTitle(event.target.value)}
                      placeholder="Nouveau groupe"
                    />
                    <Button size="icon" aria-label="Créer le groupe">
                      <Plus />
                    </Button>
                  </form>
                  {groups.map((group) => (
                    <button
                      key={group.id}
                      type="button"
                      className={cn(
                        "rounded-lg p-3 text-left hover:bg-muted",
                        group.id === selectedGroupId && "bg-muted"
                      )}
                      onClick={() => {
                        setSelectedGroupId(group.id)
                        void loadGroupMessages(group.id)
                      }}
                    >
                      <span className="block truncate text-sm font-medium">
                        {group.title}
                      </span>
                      <span className="mt-1 block text-xs text-muted-foreground">
                        {group.memberCount} membre
                        {group.memberCount > 1 ? "s" : ""}
                      </span>
                    </button>
                  ))}
                </div>
              </ScrollArea>
              <div className="flex min-h-0 flex-col rounded-xl border border-border">
                {selectedGroup ? (
                  <>
                    <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
                      <p className="min-w-0 flex-1 truncate text-sm font-semibold">
                        {selectedGroup.title}
                      </p>
                      {selectedGroup.role === "owner" ? (
                        <form
                          className="flex gap-2"
                          onSubmit={(event) => {
                            event.preventDefault()
                            if (!inviteEmail.trim()) return
                            void action(async () => {
                              await api("/api/group-invitations", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({
                                  groupId: selectedGroup.id,
                                  email: inviteEmail,
                                }),
                              })
                              setInviteEmail("")
                            }, "Invitation envoyée par e-mail.")
                          }}
                        >
                          <Input
                            type="email"
                            value={inviteEmail}
                            onChange={(event) =>
                              setInviteEmail(event.target.value)
                            }
                            placeholder="adresse@exemple.fr"
                            className="w-52"
                          />
                          <Button size="sm" variant="outline">
                            <UserPlus /> Inviter
                          </Button>
                        </form>
                      ) : null}
                    </div>
                    <ScrollArea className="min-h-0 flex-1">
                      <div className="grid gap-3 p-4">
                        {groupMessages.map((message) => (
                          <article
                            key={message.id}
                            className={cn(
                              "max-w-[85%] rounded-xl p-3 text-sm",
                              message.authorUserId === user.id
                                ? "ml-auto bg-primary text-primary-foreground"
                                : "bg-muted"
                            )}
                          >
                            <p className="mb-1 text-xs font-semibold opacity-70">
                              {message.authorName}
                            </p>
                            <p className="whitespace-pre-wrap">
                              {message.content}
                            </p>
                          </article>
                        ))}
                      </div>
                    </ScrollArea>
                    <form
                      className="flex gap-2 border-t border-border p-3"
                      onSubmit={(event) => {
                        event.preventDefault()
                        const content = groupMessage.trim()
                        if (!content) return
                        void action(async () => {
                          await api("/api/group-messages", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                              groupId: selectedGroup.id,
                              content,
                            }),
                          })
                          setGroupMessage("")
                          await loadGroupMessages(selectedGroup.id)
                        }, "Message envoyé.")
                      }}
                    >
                      <Input
                        value={groupMessage}
                        onChange={(event) =>
                          setGroupMessage(event.target.value)
                        }
                        placeholder="Écrire au groupe…"
                      />
                      <Button size="icon" aria-label="Envoyer">
                        <Send />
                      </Button>
                    </form>
                  </>
                ) : (
                  <div className="grid flex-1 place-items-center p-6 text-sm text-muted-foreground">
                    Créez ou sélectionnez un groupe.
                  </div>
                )}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="announcements" className="min-h-0 flex-1 p-4">
            <ScrollArea className="h-full">
              <div className="mx-auto grid max-w-3xl gap-3 pb-4">
                {user.capabilities.superAdminAccess ? (
                  <form
                    className="grid gap-3 rounded-xl border border-border p-4"
                    onSubmit={(event) => {
                      event.preventDefault()
                      void action(async () => {
                        await api("/api/announcements", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            title: announcementTitle,
                            body: announcementBody,
                            kind: "changelog",
                          }),
                        })
                        setAnnouncementTitle("")
                        setAnnouncementBody("")
                      }, "Annonce publiée.")
                    }}
                  >
                    <p className="font-semibold">Publier une nouveauté</p>
                    <Input
                      value={announcementTitle}
                      onChange={(event) =>
                        setAnnouncementTitle(event.target.value)
                      }
                      placeholder="Titre"
                    />
                    <Textarea
                      value={announcementBody}
                      onChange={(event) =>
                        setAnnouncementBody(event.target.value)
                      }
                      placeholder="Nouveautés, changements à venir…"
                    />
                    <Button disabled={busy}>Publier</Button>
                  </form>
                ) : null}
                {announcements.map((announcement) => (
                  <article
                    key={announcement.id}
                    className="rounded-xl border border-border p-5"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">{announcement.kind}</Badge>
                      <span className="text-xs text-muted-foreground">
                        {date(announcement.publishedAt)}
                      </span>
                    </div>
                    <h3 className="mt-3 font-editorial text-xl">
                      {announcement.title}
                    </h3>
                    <p className="mt-2 text-sm leading-6 whitespace-pre-wrap text-muted-foreground">
                      {announcement.body}
                    </p>
                  </article>
                ))}
                {!announcements.length ? (
                  <p className="rounded-xl bg-muted/40 p-8 text-center text-sm text-muted-foreground">
                    Aucune annonce pour le moment.
                  </p>
                ) : null}
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="notifications" className="min-h-0 flex-1 p-4">
            <ScrollArea className="h-full">
              <div className="mx-auto grid max-w-3xl gap-2 pb-4">
                {notifications.some((item) => !item.readAt) ? (
                  <Button
                    className="mb-2 justify-self-end"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      void action(
                        () =>
                          api("/api/notifications", {
                            method: "PATCH",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({}),
                          }),
                        "Notifications marquées comme lues."
                      )
                    }
                  >
                    <Check /> Tout marquer comme lu
                  </Button>
                ) : null}
                {notifications.map((notification) => (
                  <article
                    key={notification.id}
                    className={cn(
                      "rounded-xl border border-border p-4",
                      !notification.readAt && "bg-primary/5"
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <Bell className="mt-0.5 size-4 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold">
                          {notification.title}
                        </p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {notification.body}
                        </p>
                        <p className="mt-2 text-xs text-muted-foreground">
                          {date(notification.createdAt)}
                        </p>
                      </div>
                      {!notification.readAt ? (
                        <span className="size-2 rounded-full bg-primary" />
                      ) : null}
                    </div>
                  </article>
                ))}
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
