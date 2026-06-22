import { lazy, Suspense, useCallback, useEffect, useState } from "react"
import {
  BookOpen,
  Library,
  LoaderCircle,
  Menu,
  MessageSquare,
  PanelRight,
  PencilLine,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Trash2,
} from "lucide-react"
import { toast } from "sonner"
import type { AuthUser } from "@/lib/auth-types"
import { AccountSettingsDialog } from "@/components/auth/account-settings-dialog"
import { ChatSidebar } from "@/components/chat/chat-sidebar"
import { ConversationView } from "@/components/chat/conversation-view"
import { FeedbackDialog } from "@/components/chat/feedback-dialog"
import { LibraryDialog } from "@/components/chat/library-dialog"
import { ModelPicker } from "@/components/chat/model-picker"
import { SessionPanel } from "@/components/chat/session-panel"
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "@/components/ui/command"
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
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { estimateTokens, useChatStore } from "@/hooks/use-chat-store"

const AdminDialog = lazy(() => import("@/components/admin/admin-dialog"))

function MemoryDialog({
  open,
  onOpenChange,
  memories,
  autoMemory,
  onToggle,
  onAutoMemoryChange,
  onAdd,
  onUpdate,
  onDelete,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  memories: ReturnType<typeof useChatStore>["state"]["memories"]
  autoMemory: boolean
  onToggle: (id: string) => void
  onAutoMemoryChange: (value: boolean) => void
  onAdd: (title: string, content: string) => void
  onUpdate: (id: string, title: string, content: string) => void
  onDelete: (id: string) => void
}) {
  const [title, setTitle] = useState("")
  const [content, setContent] = useState("")
  const [editingId, setEditingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const submit = () => {
    if (!title.trim() || !content.trim()) return
    if (editingId) onUpdate(editingId, title, content)
    else onAdd(title, content)
    setTitle("")
    setContent("")
    setEditingId(null)
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[640px]">
          <DialogHeader>
            <DialogTitle className="font-editorial text-2xl">
              Mémoire de Lumy
            </DialogTitle>
            <DialogDescription>
              Les mémoires actives enrichissent automatiquement le contexte des
              nouvelles réponses.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-start gap-3 rounded-xl border border-border bg-muted/35 p-4">
            <Sparkles className="mt-0.5 size-4 shrink-0 text-primary" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">Mémorisation intelligente</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Lumy peut retenir les préférences, objectifs et contraintes
                durables que vous indiquez. Les secrets et informations
                sensibles sont exclus.
              </p>
            </div>
            <Switch
              checked={autoMemory}
              onCheckedChange={onAutoMemoryChange}
              aria-label="Activer la mémorisation intelligente"
            />
          </div>
          <div className="flex max-h-[300px] flex-col gap-2 overflow-y-auto pr-1">
            {memories.length ? (
              memories.map((memory) => (
                <div
                  key={memory.id}
                  className="flex items-start gap-3 rounded-lg border border-border p-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-medium">{memory.title}</p>
                      {memory.source === "automatic" ? (
                        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                          Automatique
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      {memory.content}
                    </p>
                  </div>
                  <Switch
                    checked={memory.enabled}
                    onCheckedChange={() => onToggle(memory.id)}
                    aria-label={`Activer ${memory.title}`}
                  />
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => {
                      setEditingId(memory.id)
                      setTitle(memory.title)
                      setContent(memory.content)
                    }}
                    aria-label={`Modifier ${memory.title}`}
                  >
                    <PencilLine />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => setDeletingId(memory.id)}
                    aria-label={`Supprimer ${memory.title}`}
                  >
                    <Trash2 />
                  </Button>
                </div>
              ))
            ) : (
              <div className="rounded-lg bg-muted/60 px-5 py-8 text-center">
                <p className="text-sm font-medium">Aucune mémoire</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {autoMemory
                    ? "Lumy ajoutera ici les informations durables qu’il identifie."
                    : "Ajoutez uniquement ce que vous souhaitez que Lumy retienne."}
                </p>
              </div>
            )}
          </div>
          <Separator />
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="memory-title">
                {editingId ? "Modifier la mémoire" : "Nouvelle mémoire"}
              </FieldLabel>
              <Input
                id="memory-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Ex. Préférence de format"
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="memory-content">
                Ce que Lumy doit retenir
              </FieldLabel>
              <Textarea
                id="memory-content"
                value={content}
                onChange={(event) => setContent(event.target.value)}
                placeholder="Décrivez une préférence ou un élément durable…"
              />
            </Field>
          </FieldGroup>
          <DialogFooter>
            {editingId ? (
              <Button
                variant="ghost"
                onClick={() => {
                  setEditingId(null)
                  setTitle("")
                  setContent("")
                }}
              >
                Annuler la modification
              </Button>
            ) : null}
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Fermer
            </Button>
            <Button
              onClick={submit}
              disabled={!title.trim() || !content.trim()}
            >
              {editingId ? (
                <PencilLine data-icon="inline-start" />
              ) : (
                <Plus data-icon="inline-start" />
              )}
              {editingId ? "Enregistrer" : "Ajouter à la mémoire"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmDeleteDialog
        open={Boolean(deletingId)}
        onOpenChange={(isOpen) => {
          if (!isOpen) setDeletingId(null)
        }}
        title="Supprimer cette mémoire ?"
        description={`« ${memories.find((memory) => memory.id === deletingId)?.title ?? "Cette mémoire"} » ne sera plus utilisée dans les réponses.`}
        onConfirm={() => {
          if (deletingId) onDelete(deletingId)
          setDeletingId(null)
        }}
      />
    </>
  )
}

export function ChatApp({
  user,
  onUserChange,
  onSignedOut,
}: {
  user: AuthUser
  onUserChange: (user: AuthUser) => void
  onSignedOut: () => void
}) {
  const chat = useChatStore(user.id)
  const [leftOpen, setLeftOpen] = useState(false)
  const [rightOpen, setRightOpen] = useState(false)
  const [commandOpen, setCommandOpen] = useState(false)
  const [memoryOpen, setMemoryOpen] = useState(false)
  const [libraryOpen, setLibraryOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [feedbackOpen, setFeedbackOpen] = useState(false)
  const [adminOpen, setAdminOpen] = useState(false)
  const [modelsReady, setModelsReady] = useState(false)
  const handleModelsDetected = useCallback(() => setModelsReady(true), [])
  const latestRoutedContextWindow = chat.activeConversation?.messages
    .slice()
    .reverse()
    .find((message) => message.routedContextWindow)?.routedContextWindow
  const sessionModel =
    chat.state.selectedModel?.provider === "lumy" && latestRoutedContextWindow
      ? {
          ...chat.state.selectedModel,
          contextWindow: latestRoutedContextWindow,
        }
      : chat.state.selectedModel

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault()
        setCommandOpen(true)
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "n") {
        event.preventDefault()
        chat.newConversation()
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [chat.newConversation])

  const logout = async () => {
    const response = await fetch("/api/auth/session", { method: "DELETE" })
    if (!response.ok) {
      toast.error("Déconnexion impossible.")
      return
    }
    onSignedOut()
  }

  const sidebar = (
    <ChatSidebar
      conversations={chat.state.conversations}
      activeId={chat.state.activeConversationId}
      onSelect={(id) => {
        chat.selectConversation(id)
        setLeftOpen(false)
      }}
      onNew={() => {
        chat.newConversation()
        setLeftOpen(false)
      }}
      onDelete={chat.deleteConversation}
      onRename={chat.renameConversation}
      onTogglePinned={chat.togglePinned}
      onOpenMemory={() => setMemoryOpen(true)}
      onOpenLibrary={() => setLibraryOpen(true)}
      onOpenSettings={() => setSettingsOpen(true)}
      onOpenFeedback={() => setFeedbackOpen(true)}
      onOpenAdmin={() => setAdminOpen(true)}
      onLogout={logout}
      user={user}
      onCloseMobile={leftOpen ? () => setLeftOpen(false) : undefined}
    />
  )

  const session = (
    <SessionPanel
      model={modelsReady ? sessionModel : null}
      contextTokens={estimateTokens(
        chat.activeConversation?.messages ?? [],
        chat.state.memories
      )}
      memories={chat.state.memories}
      files={chat.state.files.filter(
        (file) => file.conversationId === chat.activeConversation?.id
      )}
      onToggleMemory={chat.toggleMemory}
      onOpenMemory={() => setMemoryOpen(true)}
      onAddFiles={chat.addFiles}
      onRemoveFile={chat.removeFile}
      onCloseMobile={rightOpen ? () => setRightOpen(false) : undefined}
    />
  )

  return (
    <div className="h-svh min-h-[640px] overflow-hidden bg-background text-foreground">
      <div className="grid h-full grid-cols-[360px_minmax(0,1fr)_430px] grid-rows-[80px_minmax(0,1fr)] max-[1280px]:grid-cols-[286px_minmax(0,1fr)] max-[900px]:grid-cols-[minmax(0,1fr)]">
        <div className="row-span-2 border-r border-border max-[900px]:hidden">
          {sidebar}
        </div>

        <header className="col-start-2 flex min-w-0 items-center gap-3 border-b border-border px-6 max-[900px]:col-start-1 max-sm:px-3">
          <Button
            variant="ghost"
            size="icon"
            className="min-[901px]:hidden"
            onClick={() => setLeftOpen(true)}
            aria-label="Ouvrir la navigation"
          >
            <Menu />
          </Button>
          <h1
            className="min-w-0 flex-1 truncate font-editorial text-lg font-semibold"
            title={chat.activeConversation?.title ?? "Nouvelle discussion"}
          >
            {chat.activeConversation?.title ?? "Nouvelle discussion"}
          </h1>
          {chat.hydrated ? (
            <ModelPicker
              selectedModel={chat.state.selectedModel}
              onSelect={chat.setSelectedModel}
              onDetectionComplete={handleModelsDetected}
            />
          ) : (
            <Button
              variant="outline"
              className="h-10 w-[min(210px,35vw)] min-w-[120px] justify-start max-sm:w-10 max-sm:min-w-0 max-sm:px-2"
              disabled
            >
              <LoaderCircle className="animate-spin" data-icon="inline-start" />
              Chargement…
            </Button>
          )}
          <Button
            variant="outline"
            className="w-[260px] justify-start text-muted-foreground max-[1500px]:hidden"
            onClick={() => setCommandOpen(true)}
          >
            <Search data-icon="inline-start" />
            Rechercher dans Lumy
            <kbd className="ml-auto text-[11px]">⌘ K</kbd>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="min-[1281px]:hidden"
            onClick={() => setRightOpen(true)}
            aria-label="Ouvrir la session"
          >
            <PanelRight />
          </Button>
        </header>

        <div className="col-start-2 row-start-2 flex min-h-0 min-w-0 max-[900px]:col-start-1">
          <ConversationView
            conversation={chat.activeConversation}
            isGenerating={chat.isGenerating}
            model={modelsReady ? chat.state.selectedModel : null}
            modelAvailable={modelsReady && Boolean(chat.state.selectedModel)}
            memories={chat.state.memories}
            webSearch={chat.state.webSearch}
            webSearchAvailable={
              modelsReady && Boolean(chat.state.selectedModel)
            }
            reflection={chat.state.reflection}
            onWebSearchChange={chat.setWebSearch}
            onReflectionChange={chat.setReflection}
            onSend={chat.sendMessage}
            onStop={chat.stopGeneration}
            onAddFiles={chat.addFiles}
            userName={user.name}
          />
        </div>

        <div className="col-start-3 row-span-2 border-l border-border max-[1280px]:hidden">
          {session}
        </div>
      </div>

      <Sheet open={leftOpen} onOpenChange={setLeftOpen}>
        <SheetContent
          side="left"
          className="w-[300px] p-0"
          showCloseButton={false}
        >
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          {sidebar}
        </SheetContent>
      </Sheet>
      <Sheet open={rightOpen} onOpenChange={setRightOpen}>
        <SheetContent
          side="right"
          className="w-[360px] p-0"
          showCloseButton={false}
        >
          <SheetTitle className="sr-only">Session</SheetTitle>
          {session}
        </SheetContent>
      </Sheet>

      <CommandDialog
        open={commandOpen}
        onOpenChange={setCommandOpen}
        title="Rechercher dans Lumy"
        description="Trouvez une discussion ou lancez une commande."
      >
        <Command>
          <CommandInput placeholder="Rechercher une discussion ou une commande…" />
          <CommandList>
            <CommandEmpty>Aucun résultat.</CommandEmpty>
            <CommandGroup heading="Actions">
              <CommandItem
                onSelect={() => {
                  chat.newConversation()
                  setCommandOpen(false)
                }}
              >
                <Plus />
                Nouvelle discussion
                <CommandShortcut>⌘N</CommandShortcut>
              </CommandItem>
              <CommandItem
                onSelect={() => {
                  setMemoryOpen(true)
                  setCommandOpen(false)
                }}
              >
                <BookOpen />
                Ouvrir la mémoire
              </CommandItem>
              <CommandItem
                onSelect={() => {
                  setLibraryOpen(true)
                  setCommandOpen(false)
                }}
              >
                <Library />
                Ouvrir la bibliothèque
              </CommandItem>
              <CommandItem
                onSelect={() => {
                  setSettingsOpen(true)
                  setCommandOpen(false)
                }}
              >
                <Settings />
                Paramètres
              </CommandItem>
              {user.role === "admin" ? (
                <CommandItem
                  onSelect={() => {
                    setAdminOpen(true)
                    setCommandOpen(false)
                  }}
                >
                  <ShieldCheck />
                  Administration
                </CommandItem>
              ) : null}
            </CommandGroup>
            <CommandGroup heading="Discussions">
              {chat.state.conversations.map((conversation) => (
                <CommandItem
                  key={conversation.id}
                  value={conversation.title}
                  onSelect={() => {
                    chat.selectConversation(conversation.id)
                    setCommandOpen(false)
                  }}
                >
                  <MessageSquare />
                  <span
                    className="min-w-0 flex-1 truncate"
                    title={conversation.title}
                  >
                    {conversation.title}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </CommandDialog>

      <MemoryDialog
        open={memoryOpen}
        onOpenChange={setMemoryOpen}
        memories={chat.state.memories}
        autoMemory={chat.state.autoMemory}
        onToggle={chat.toggleMemory}
        onAutoMemoryChange={chat.setAutoMemory}
        onAdd={chat.addMemory}
        onUpdate={chat.updateMemory}
        onDelete={chat.deleteMemory}
      />
      <LibraryDialog
        open={libraryOpen}
        onOpenChange={setLibraryOpen}
        files={chat.state.files}
        conversations={chat.state.conversations}
        onRemove={chat.removeFile}
      />
      <AccountSettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        user={user}
        onUserChange={onUserChange}
        onSignedOut={onSignedOut}
      />
      <FeedbackDialog open={feedbackOpen} onOpenChange={setFeedbackOpen} />
      {user.role === "admin" ? (
        <Suspense fallback={null}>
          <AdminDialog
            open={adminOpen}
            onOpenChange={setAdminOpen}
            currentUserId={user.id}
          />
        </Suspense>
      ) : null}
    </div>
  )
}
