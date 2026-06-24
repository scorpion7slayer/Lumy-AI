import { useState } from "react"
import {
  Bell,
  ChevronDown,
  Headphones,
  Library,
  LogOut,
  MemoryStick,
  MessageSquareHeart,
  MessageSquare,
  MoreHorizontal,
  PanelLeftClose,
  PencilLine,
  Pin,
  PinOff,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  Trash2,
  UserRound,
} from "lucide-react"
import type { Conversation } from "@/lib/chat-types"
import type { AuthUser } from "@/lib/auth-types"
import { LumyLogo, PoweredByZyranex } from "@/components/lumy-logo"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"

type ChatSidebarProps = {
  conversations: Conversation[]
  activeId: string | null
  onSelect: (id: string) => void
  onNew: () => void
  onDelete: (id: string) => void
  onRename: (id: string, title: string) => void
  onTogglePinned: (id: string) => void
  onOpenMemory: () => void
  onOpenLibrary: () => void
  onOpenSupport: () => void
  onOpenNotifications: () => void
  onOpenSettings: () => void
  onOpenFeedback: () => void
  onOpenAdmin: () => void
  onLogout: () => void
  user: AuthUser
  unreadNotifications: number
  onCloseMobile?: () => void
}

function ConversationRow({
  conversation,
  active,
  onSelect,
  onDelete,
  onRename,
  onTogglePinned,
}: {
  conversation: Conversation
  active: boolean
  onSelect: () => void
  onDelete: () => void
  onRename: () => void
  onTogglePinned: () => void
}) {
  return (
    <div
      className={cn(
        "group grid w-full min-w-0 grid-cols-[minmax(0,1fr)_2rem] items-center overflow-hidden rounded-lg pr-1 transition-colors",
        active ? "bg-sidebar-accent" : "hover:bg-sidebar-accent/60"
      )}
    >
      <button
        className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden px-3 py-2 text-left text-[13px]"
        onClick={onSelect}
        type="button"
      >
        <MessageSquare className="size-4 shrink-0 text-muted-foreground" />
        <span className="truncate" title={conversation.title}>
          {conversation.title}
        </span>
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            className="shrink-0 opacity-70 group-focus-within:opacity-100 group-hover:opacity-100 data-[state=open]:opacity-100"
            aria-label={`Actions pour ${conversation.title}`}
          >
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuGroup>
            <DropdownMenuItem onSelect={onRename}>
              <PencilLine />
              Renommer
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onTogglePinned}>
              {conversation.pinned ? <PinOff /> : <Pin />}
              {conversation.pinned ? "Désépingler" : "Épingler"}
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onSelect={onDelete}>
              <Trash2 />
              Supprimer
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

export function ChatSidebar({
  conversations,
  activeId,
  onSelect,
  onNew,
  onDelete,
  onRename,
  onTogglePinned,
  onOpenMemory,
  onOpenLibrary,
  onOpenSupport,
  onOpenNotifications,
  onOpenSettings,
  onOpenFeedback,
  onOpenAdmin,
  onLogout,
  user,
  unreadNotifications,
  onCloseMobile,
}: ChatSidebarProps) {
  const [query, setQuery] = useState("")
  const [renaming, setRenaming] = useState<Conversation | null>(null)
  const [renameTitle, setRenameTitle] = useState("")
  const [deleting, setDeleting] = useState<Conversation | null>(null)
  const filtered = conversations.filter((conversation) =>
    conversation.title
      .toLocaleLowerCase("fr")
      .includes(query.toLocaleLowerCase("fr"))
  )
  const pinned = filtered.filter((conversation) => conversation.pinned)
  const today = filtered.filter(
    (conversation) =>
      !conversation.pinned &&
      new Date(conversation.createdAt).toDateString() ===
        new Date().toDateString()
  )
  const older = filtered.filter(
    (conversation) => !conversation.pinned && !today.includes(conversation)
  )
  const initials =
    user.name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join("") || "U"

  const handleRename = (conversation: Conversation) => {
    setRenaming(conversation)
    setRenameTitle(conversation.title)
  }

  const handleDelete = (conversation: Conversation) => {
    setDeleting(conversation)
  }

  const saveRename = () => {
    if (!renaming || !renameTitle.trim()) return
    onRename(renaming.id, renameTitle.trim())
    setRenaming(null)
  }

  return (
    <>
      <aside className="flex h-full min-h-0 flex-col bg-sidebar text-sidebar-foreground">
        <div className="flex min-h-[80px] items-center justify-between gap-3 px-6 py-3 max-sm:min-h-0 max-sm:px-5">
          <div className="flex min-w-0 flex-1 items-center justify-between gap-2">
            <div className="min-w-0">
              <LumyLogo className="h-11 w-40 max-sm:h-9 max-sm:w-32" />
              <PoweredByZyranex />
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={onOpenSupport}
                aria-label="Ouvrir l’assistance"
              >
                <Headphones />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                className="relative"
                onClick={onOpenNotifications}
                aria-label={`${unreadNotifications} notification${unreadNotifications > 1 ? "s" : ""} non lue${unreadNotifications > 1 ? "s" : ""}`}
              >
                <Bell />
                {unreadNotifications ? (
                  <span className="t-badge" data-open="true">
                    <span className="t-badge-dot text-destructive-foreground grid min-h-4 min-w-4 place-items-center rounded-full bg-destructive px-1 text-[9px] font-semibold">
                      {Math.min(unreadNotifications, 99)}
                    </span>
                  </span>
                ) : null}
              </Button>
              {onCloseMobile ? (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={onCloseMobile}
                  aria-label="Fermer la navigation"
                >
                  <PanelLeftClose />
                </Button>
              ) : null}
            </div>
          </div>
        </div>

        <div className="px-5 pb-3">
          <Button className="w-full justify-between" onClick={onNew}>
            <span className="flex items-center gap-2">
              <Plus data-icon="inline-start" />
              Nouvelle discussion
            </span>
            <kbd className="rounded bg-primary-foreground/15 px-1.5 py-0.5 text-[10px] font-medium">
              ⌘ N
            </kbd>
          </Button>
        </div>

        <div className="px-5 pb-2">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Rechercher une discussion"
              aria-label="Rechercher dans les discussions"
              className="pl-9"
            />
          </div>
        </div>

        <div className="flex flex-col gap-0.5 px-5 pb-3">
          <Button
            variant="ghost"
            className="justify-start"
            onClick={onOpenLibrary}
          >
            <Library data-icon="inline-start" />
            Bibliothèque
          </Button>
          <Button
            variant="ghost"
            className="justify-start"
            onClick={onOpenMemory}
          >
            <MemoryStick data-icon="inline-start" />
            Mémoire
          </Button>
          <Button
            variant="ghost"
            className="justify-start"
            onClick={onOpenFeedback}
          >
            <MessageSquareHeart data-icon="inline-start" />
            Feedback
          </Button>
          {user.role === "admin" ? (
            <Button
              variant="ghost"
              className="justify-start"
              onClick={onOpenAdmin}
            >
              <ShieldCheck data-icon="inline-start" />
              Administration
            </Button>
          ) : null}
        </div>

        <ScrollArea className="min-h-0 flex-1 px-5">
          <div className="flex flex-col gap-5 pb-6">
            {pinned.length > 0 ? (
              <section>
                <h2 className="mb-2 px-2 text-[10px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
                  Épinglées
                </h2>
                <div className="flex flex-col gap-0.5">
                  {pinned.map((conversation) => (
                    <ConversationRow
                      key={conversation.id}
                      conversation={conversation}
                      active={conversation.id === activeId}
                      onSelect={() => onSelect(conversation.id)}
                      onDelete={() => handleDelete(conversation)}
                      onRename={() => handleRename(conversation)}
                      onTogglePinned={() => onTogglePinned(conversation.id)}
                    />
                  ))}
                </div>
              </section>
            ) : null}

            {today.length > 0 ? (
              <section>
                <h2 className="mb-2 px-2 text-[10px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
                  Aujourd’hui
                </h2>
                <div className="flex flex-col gap-0.5">
                  {today.map((conversation) => (
                    <ConversationRow
                      key={conversation.id}
                      conversation={conversation}
                      active={conversation.id === activeId}
                      onSelect={() => onSelect(conversation.id)}
                      onDelete={() => handleDelete(conversation)}
                      onRename={() => handleRename(conversation)}
                      onTogglePinned={() => onTogglePinned(conversation.id)}
                    />
                  ))}
                </div>
              </section>
            ) : null}

            {older.length > 0 ? (
              <section>
                <h2 className="mb-2 px-2 text-[10px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
                  Hier et avant
                </h2>
                <div className="flex flex-col gap-0.5">
                  {older.map((conversation) => (
                    <ConversationRow
                      key={conversation.id}
                      conversation={conversation}
                      active={conversation.id === activeId}
                      onSelect={() => onSelect(conversation.id)}
                      onDelete={() => handleDelete(conversation)}
                      onRename={() => handleRename(conversation)}
                      onTogglePinned={() => onTogglePinned(conversation.id)}
                    />
                  ))}
                </div>
              </section>
            ) : null}

            {filtered.length === 0 ? (
              <div className="rounded-lg bg-sidebar-accent/60 px-4 py-6 text-center">
                <p className="text-xs font-medium">
                  {conversations.length
                    ? "Aucun résultat"
                    : "Aucune discussion"}
                </p>
                <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
                  {conversations.length
                    ? "Essayez avec un autre terme."
                    : "Votre première discussion apparaîtra ici."}
                </p>
              </div>
            ) : null}
          </div>
        </ScrollArea>

        <div className="px-5 pb-4">
          <Separator className="mb-3" />
          <Button
            variant="ghost"
            className="w-full justify-start"
            onClick={onOpenSettings}
          >
            <Settings data-icon="inline-start" />
            Paramètres
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className="mt-2 h-auto w-full justify-between px-2 py-2"
              >
                <span className="flex items-center gap-2.5 text-left">
                  <Avatar className="size-8">
                    <AvatarFallback>{initials}</AvatarFallback>
                  </Avatar>
                  <span>
                    <span className="block text-[13px] font-medium">
                      {user.name}
                    </span>
                    <span className="block max-w-[150px] truncate text-[11px] text-muted-foreground">
                      {user.email}
                    </span>
                  </span>
                </span>
                <ChevronDown />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56" align="end">
              <DropdownMenuGroup>
                <DropdownMenuItem onSelect={onOpenSettings}>
                  <UserRound />
                  Mon compte
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={onOpenMemory}>
                  <MemoryStick />
                  Mémoire
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={onOpenLibrary}>
                  <Library />
                  Bibliothèque
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={onOpenFeedback}>
                  <MessageSquareHeart />
                  Donner mon avis
                </DropdownMenuItem>
                {user.role === "admin" ? (
                  <DropdownMenuItem onSelect={onOpenAdmin}>
                    <ShieldCheck />
                    Administration
                  </DropdownMenuItem>
                ) : null}
                <DropdownMenuItem onSelect={onLogout}>
                  <LogOut />
                  Se déconnecter
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>

      <Dialog
        open={Boolean(renaming)}
        onOpenChange={(isOpen) => {
          if (!isOpen) setRenaming(null)
        }}
      >
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle className="font-editorial text-2xl">
              Renommer la discussion
            </DialogTitle>
            <DialogDescription>
              Choisissez un titre court pour la retrouver facilement.
            </DialogDescription>
          </DialogHeader>
          <label
            className="grid gap-2 text-sm font-medium"
            htmlFor="rename-chat"
          >
            Nouveau titre
            <Input
              id="rename-chat"
              value={renameTitle}
              onChange={(event) => setRenameTitle(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") saveRename()
              }}
              autoFocus
              maxLength={120}
            />
          </label>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenaming(null)}>
              Annuler
            </Button>
            <Button onClick={saveRename} disabled={!renameTitle.trim()}>
              <PencilLine data-icon="inline-start" />
              Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDeleteDialog
        open={Boolean(deleting)}
        onOpenChange={(isOpen) => {
          if (!isOpen) setDeleting(null)
        }}
        title="Supprimer cette discussion ?"
        description={
          deleting
            ? `« ${deleting.title} » et ses fichiers seront supprimés définitivement.`
            : "Cette discussion sera supprimée définitivement."
        }
        onConfirm={() => {
          if (deleting) onDelete(deleting.id)
          setDeleting(null)
        }}
      />
    </>
  )
}
