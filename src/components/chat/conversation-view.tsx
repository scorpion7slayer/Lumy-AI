import { lazy, Suspense, useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import {
  ArrowUp,
  BrainCircuit,
  ChevronDown,
  Copy,
  Expand,
  LoaderCircle,
  Mic,
  Paperclip,
  Search,
  Shuffle,
  Square,
} from "lucide-react"
import type {
  ChatMessage,
  ChatModel,
  Conversation,
  MemoryItem,
  ReflectionLevel,
} from "@/lib/chat-types"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { CHAT_FILE_ACCEPT } from "@/lib/file-support"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Toggle } from "@/components/ui/toggle"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { providerLabels } from "@/lib/providers"

const MarkdownMessage = lazy(() =>
  import("@/components/chat/markdown-message").then((module) => ({
    default: module.MarkdownMessage,
  }))
)

function formatDuration(milliseconds: number) {
  if (milliseconds < 1_000) return `${Math.round(milliseconds)} ms`
  return `${(milliseconds / 1_000).toLocaleString("fr-FR", {
    maximumFractionDigits: 1,
  })} s`
}

function RichText({
  content,
  streaming,
}: {
  content: string
  streaming?: boolean
}) {
  return (
    <div className="chat-prose min-w-0 [overflow-wrap:anywhere]">
      <Suspense
        fallback={<p className="break-words whitespace-pre-wrap">{content}</p>}
      >
        <MarkdownMessage content={content} streaming={streaming} />
      </Suspense>
    </div>
  )
}

function MessageActions({ message }: { message: ChatMessage }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    await navigator.clipboard.writeText(message.content)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1_400)
  }
  return (
    <div className="mt-4 flex items-center gap-1 text-muted-foreground">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={copy}
            aria-label="Copier la réponse"
          >
            <Copy />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{copied ? "Copié" : "Copier"}</TooltipContent>
      </Tooltip>
    </div>
  )
}

function ThinkingBlock({ message }: { message: ChatMessage }) {
  const [open, setOpen] = useState(Boolean(message.reasoningStreaming))
  const visible = Boolean(message.reasoning || message.reasoningStreaming)

  useEffect(() => {
    if (message.reasoningStreaming) setOpen(true)
  }, [message.reasoningStreaming])

  if (!visible) return null
  return (
    <div className="mb-5 overflow-hidden rounded-xl border border-border bg-muted/35">
      <button
        type="button"
        className="flex w-full items-center gap-2 px-3.5 py-3 text-left text-sm font-medium transition-colors hover:bg-muted/55"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
      >
        {message.reasoningStreaming ? (
          <LoaderCircle className="size-4 animate-spin text-primary" />
        ) : (
          <BrainCircuit className="size-4 text-primary" />
        )}
        <span>
          {message.reasoningStreaming
            ? "Réflexion en cours…"
            : "Réflexion du modèle"}
        </span>
        {message.reasoningTimeMs !== undefined ? (
          <span className="text-xs font-normal text-muted-foreground">
            {formatDuration(message.reasoningTimeMs)}
          </span>
        ) : null}
        <ChevronDown
          className={cn(
            "ml-auto size-4 text-muted-foreground transition-transform",
            open && "rotate-180"
          )}
        />
      </button>
      {open ? (
        <div
          className="max-h-64 overflow-y-auto border-t border-border px-3.5 py-3 font-mono text-xs leading-5 [overflow-wrap:anywhere] whitespace-pre-wrap text-muted-foreground"
          aria-live={message.reasoningStreaming ? "polite" : "off"}
        >
          {message.reasoning || "Le modèle prépare sa réponse…"}
        </div>
      ) : null}
    </div>
  )
}

function ResponseMetrics({ message }: { message: ChatMessage }) {
  if (
    message.streaming ||
    (message.responseTimeMs === undefined &&
      message.firstTokenTimeMs === undefined)
  )
    return null

  return (
    <p
      className="mt-3 text-xs text-muted-foreground tabular-nums"
      aria-label="Temps de génération"
    >
      {message.responseTimeMs !== undefined
        ? `Réponse en ${formatDuration(message.responseTimeMs)}`
        : null}
      {message.responseTimeMs !== undefined &&
      message.firstTokenTimeMs !== undefined
        ? " · "
        : null}
      {message.firstTokenTimeMs !== undefined
        ? `Premier contenu en ${formatDuration(message.firstTokenTimeMs)}`
        : null}
    </p>
  )
}

function MemoryUsageIndicator({
  memoryIds,
  memories,
}: {
  memoryIds: string[] | undefined
  memories: MemoryItem[]
}) {
  const usedMemories = memoryIds?.flatMap((id) => {
    const memory = memories.find((item) => item.id === id)
    return memory ? [memory] : []
  })
  if (!usedMemories?.length) return null

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="grid size-5 place-items-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          aria-label="Cette réponse utilise la mémoire"
        >
          <span className="size-2 rounded-full bg-primary" />
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-72 flex-col items-start gap-1 px-3 py-2">
        <span className="font-medium">Information récupérée en mémoire</span>
        {usedMemories.map((memory) => (
          <span className="text-background/75" key={memory.id}>
            {memory.title}
          </span>
        ))}
      </TooltipContent>
    </Tooltip>
  )
}

function AssistantMessage({
  message,
  memories,
}: {
  message: ChatMessage
  memories: MemoryItem[]
}) {
  return (
    <article className="grid grid-cols-[38px_minmax(0,1fr)] gap-4">
      <Avatar className="mt-0.5 size-8">
        <AvatarFallback className="bg-primary text-primary-foreground">
          L
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <div className="mb-4 flex items-center gap-1.5">
          <p className="font-editorial text-lg font-semibold">Lumy</p>
          <MemoryUsageIndicator
            memoryIds={message.usedMemoryIds}
            memories={memories}
          />
          {message.routedProvider ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="ml-1 inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                  <Shuffle className="size-3" />
                  {providerLabels[message.routedProvider]}
                </span>
              </TooltipTrigger>
              <TooltipContent className="max-w-72 flex-col items-start gap-1 px-3 py-2">
                <span className="font-medium">
                  Modèle choisi automatiquement par Lumy AI
                </span>
                {message.routedModelId ? (
                  <span className="text-background/75">
                    {message.routedModelId}
                  </span>
                ) : null}
                {message.fallbackCount ? (
                  <span className="text-background/75">
                    {message.fallbackCount} basculement
                    {message.fallbackCount > 1 ? "s" : ""} automatique
                    {message.fallbackCount > 1 ? "s" : ""}
                  </span>
                ) : null}
              </TooltipContent>
            </Tooltip>
          ) : null}
        </div>
        <ThinkingBlock message={message} />
        <div className={cn(message.error && "text-destructive")}>
          <RichText content={message.content} streaming={message.streaming} />
          {message.streaming ? (
            <span className="ml-1 inline-block h-4 w-1 animate-pulse bg-primary align-middle" />
          ) : null}
        </div>
        <ResponseMetrics message={message} />
        {!message.streaming && message.content ? (
          <MessageActions message={message} />
        ) : null}
      </div>
    </article>
  )
}

function UserMessage({
  message,
  initials,
}: {
  message: ChatMessage
  initials: string
}) {
  return (
    <article className="grid grid-cols-[38px_minmax(0,1fr)] gap-4">
      <Avatar className="mt-0.5 size-8">
        <AvatarFallback>{initials}</AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <p className="mb-2 font-editorial text-lg font-semibold">Vous</p>
        <p className="text-[15px] leading-7 whitespace-pre-wrap">
          {message.content}
        </p>
      </div>
    </article>
  )
}

export function ConversationView({
  conversation,
  isGenerating,
  model,
  modelAvailable,
  memories,
  webSearch,
  webSearchAvailable,
  reflection,
  onWebSearchChange,
  onReflectionChange,
  onSend,
  onStop,
  onAddFiles,
  userName,
}: {
  conversation: Conversation | null
  isGenerating: boolean
  model: ChatModel | null
  modelAvailable: boolean
  memories: MemoryItem[]
  webSearch: boolean
  webSearchAvailable: boolean
  reflection: ReflectionLevel
  onWebSearchChange: (value: boolean) => void
  onReflectionChange: (value: ReflectionLevel) => void
  onSend: (content: string) => void
  onStop: () => void
  onAddFiles: (files: FileList | null) => void
  userName: string
}) {
  const [draft, setDraft] = useState("")
  const [expanded, setExpanded] = useState(false)
  const [dictating, setDictating] = useState(false)
  const [atBottom, setAtBottom] = useState(true)
  const scrollRef = useRef<HTMLDivElement>(null)
  const stickToBottomRef = useRef(true)
  const messages = conversation?.messages ?? []
  const reasoningLevels = model?.reasoningLevels ?? []
  const initials =
    userName
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join("") || "U"

  const scrollToBottom = (behavior: ScrollBehavior = "smooth") => {
    const element = scrollRef.current
    if (!element) return
    stickToBottomRef.current = true
    setAtBottom(true)
    element.scrollTo({
      top: element.scrollHeight,
      behavior,
    })
  }

  useEffect(() => {
    const frame = requestAnimationFrame(() => scrollToBottom("auto"))
    return () => cancelAnimationFrame(frame)
    // A newly selected conversation always opens on its latest message.
  }, [conversation?.id])

  useEffect(() => {
    if (!stickToBottomRef.current) return
    const frame = requestAnimationFrame(() => scrollToBottom("auto"))
    return () => cancelAnimationFrame(frame)
  }, [messages])

  const handleScroll = () => {
    const element = scrollRef.current
    if (!element) return
    const bottomDistance =
      element.scrollHeight - element.scrollTop - element.clientHeight
    const isAtBottom = bottomDistance <= 72
    stickToBottomRef.current = isAtBottom
    setAtBottom(isAtBottom)
  }

  const submit = () => {
    if (!draft.trim() || isGenerating) return
    stickToBottomRef.current = true
    setAtBottom(true)
    onSend(draft)
    setDraft("")
    setExpanded(false)
  }

  const startDictation = () => {
    type SpeechResultEvent = {
      results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }>
    }
    type SpeechRecognitionLike = {
      lang: string
      interimResults: boolean
      continuous: boolean
      start: () => void
      stop: () => void
      onresult: ((event: SpeechResultEvent) => void) | null
      onend: (() => void) | null
      onerror: (() => void) | null
    }
    type SpeechRecognitionConstructor = new () => SpeechRecognitionLike
    const speechWindow = window as typeof window & {
      SpeechRecognition?: SpeechRecognitionConstructor
      webkitSpeechRecognition?: SpeechRecognitionConstructor
    }
    const Recognition =
      speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition
    if (!Recognition) {
      toast.error(
        "La dictée vocale n’est pas prise en charge par ce navigateur."
      )
      return
    }
    const recognition = new Recognition()
    recognition.lang = "fr-FR"
    recognition.interimResults = true
    recognition.continuous = false
    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map((result) => result[0].transcript)
        .join(" ")
      setDraft(transcript)
    }
    recognition.onend = () => setDictating(false)
    recognition.onerror = () => {
      setDictating(false)
      toast.error("La dictée n’a pas pu démarrer.")
    }
    setDictating(true)
    recognition.start()
  }

  return (
    <main className="relative flex min-h-0 min-w-0 flex-1 flex-col bg-background">
      <div
        ref={scrollRef}
        data-testid="conversation-scroll"
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
        onScroll={handleScroll}
      >
        {messages.length > 0 ? (
          <div className="mx-auto flex w-full max-w-[820px] flex-col gap-9 px-8 pt-14 pb-10 max-sm:px-5">
            {messages.map((message, index) => (
              <div key={message.id}>
                {message.role === "user" ? (
                  <UserMessage message={message} initials={initials} />
                ) : (
                  <AssistantMessage message={message} memories={memories} />
                )}
                {index < messages.length - 1 ? (
                  <Separator className="mt-9" />
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <div className="grid h-full min-h-[360px] place-items-center px-6 py-12 text-center">
            <div className="max-w-lg">
              <div className="mx-auto mb-5 grid size-12 place-items-center rounded-full bg-primary font-editorial text-xl text-primary-foreground">
                L
              </div>
              <h1 className="font-editorial text-3xl font-semibold tracking-tight">
                Que souhaitez-vous explorer ?
              </h1>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                {modelAvailable
                  ? "Posez une question ou joignez un document pour commencer."
                  : "Aucun modèle n’a été détecté. Ajoutez une clé API pour commencer."}
              </p>
            </div>
          </div>
        )}
      </div>

      <div className="relative z-10 shrink-0 border-t border-border/70 bg-background/95 px-4 pt-3 pb-3 backdrop-blur-sm sm:px-7">
        {!atBottom && messages.length > 0 ? (
          <Button
            variant="secondary"
            size="icon-sm"
            className="absolute -top-11 left-1/2 -translate-x-1/2 rounded-full border border-border shadow-md"
            onClick={() => scrollToBottom()}
            aria-label="Aller au dernier message"
          >
            <ChevronDown />
          </Button>
        ) : null}
        <div className="mx-auto w-full max-w-[900px]">
          <div className="rounded-2xl border border-border bg-card p-3 shadow-[0_10px_32px_rgba(49,45,36,0.08)] focus-within:border-primary/50">
            <div className="flex items-start gap-2">
              <Textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault()
                    submit()
                  }
                }}
                placeholder={
                  modelAvailable
                    ? "Écrivez votre message…"
                    : "Aucun modèle disponible"
                }
                aria-label="Message"
                disabled={!modelAvailable}
                className="max-h-40 min-h-[56px] flex-1 resize-none border-0 bg-transparent px-2 py-2 text-[15px] shadow-none focus-visible:ring-0"
              />
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => setExpanded(true)}
                    aria-label="Agrandir le champ de message"
                  >
                    <Expand />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Agrandir</TooltipContent>
              </Tooltip>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <Button variant="outline" size="icon" asChild>
                <label aria-label="Joindre des fichiers">
                  <Paperclip />
                  <input
                    type="file"
                    multiple
                    accept={CHAT_FILE_ACCEPT}
                    className="sr-only"
                    onChange={(event) => onAddFiles(event.target.files)}
                  />
                </label>
              </Button>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Toggle
                    pressed={webSearch}
                    onPressedChange={onWebSearchChange}
                    disabled={!webSearchAvailable}
                    variant="outline"
                    aria-label={
                      webSearchAvailable
                        ? `${webSearch ? "Désactiver" : "Autoriser"} la recherche web intelligente`
                        : "Sélectionnez un modèle pour utiliser la recherche web"
                    }
                  >
                    <Search />
                    {webSearch ? "Recherche web auto" : "Recherche web"}
                  </Toggle>
                </TooltipTrigger>
                <TooltipContent>
                  {webSearchAvailable
                    ? "Lumy cherchera via DuckDuckGo uniquement si la question le nécessite."
                    : "Sélectionnez d’abord un modèle."}
                </TooltipContent>
              </Tooltip>
              <div className="ml-auto flex items-center gap-2 max-sm:ml-0 max-sm:w-full">
                <span className="hidden items-center gap-1.5 text-xs text-muted-foreground lg:flex">
                  <BrainCircuit className="size-3.5" />
                  Réflexion
                </span>
                {reasoningLevels.length > 1 ? (
                  <Select
                    value={reflection}
                    onValueChange={(value) =>
                      onReflectionChange(value as ReflectionLevel)
                    }
                  >
                    <SelectTrigger
                      size="sm"
                      className="w-[142px]"
                      aria-label="Niveau de réflexion"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {reasoningLevels.includes("low") ? (
                          <SelectItem value="low">Rapide</SelectItem>
                        ) : null}
                        {reasoningLevels.includes("medium") ? (
                          <SelectItem value="medium">Équilibrée</SelectItem>
                        ) : null}
                        {reasoningLevels.includes("high") ? (
                          <SelectItem value="high">Approfondie</SelectItem>
                        ) : null}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                ) : (
                  <div
                    className="flex h-8 min-w-[142px] items-center rounded-md border border-border bg-muted/35 px-3 text-xs text-muted-foreground"
                    aria-label="Niveau de réflexion"
                  >
                    {reasoningLevels.length === 1
                      ? "Réflexion automatique"
                      : "Sans réflexion"}
                  </div>
                )}
                <Button
                  variant={dictating ? "secondary" : "outline"}
                  size="icon"
                  onClick={startDictation}
                  aria-label="Dicter le message"
                >
                  <Mic />
                </Button>
                {isGenerating ? (
                  <Button
                    size="icon"
                    onClick={onStop}
                    aria-label="Arrêter la génération"
                  >
                    <Square />
                  </Button>
                ) : (
                  <Button
                    size="icon"
                    onClick={submit}
                    disabled={!draft.trim() || !modelAvailable}
                    aria-label="Envoyer le message"
                  >
                    <ArrowUp />
                  </Button>
                )}
              </div>
            </div>
          </div>
          <p className="pt-2 text-center text-[10px] text-muted-foreground">
            Lumy peut se tromper. Vérifiez les informations importantes.
          </p>
        </div>
      </div>
      <Dialog open={expanded} onOpenChange={setExpanded}>
        <DialogContent className="flex h-[calc(100svh-2rem)] max-h-[720px] min-h-0 w-[calc(100vw-2rem)] max-w-[760px] flex-col overflow-hidden sm:max-w-[760px]">
          <DialogHeader className="shrink-0 pr-8">
            <DialogTitle className="font-editorial text-2xl">
              Rédiger le message
            </DialogTitle>
            <DialogDescription>
              Utilisez cet espace pour préparer une demande plus longue.
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-hidden">
            <Textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              aria-label="Message en plein écran"
              className="field-sizing-fixed h-full min-h-0 resize-none overflow-y-auto text-[15px] leading-7"
              autoFocus
            />
          </div>
          <DialogFooter className="shrink-0">
            <Button variant="outline" onClick={() => setExpanded(false)}>
              Réduire
            </Button>
            <Button
              onClick={submit}
              disabled={!draft.trim() || isGenerating || !modelAvailable}
            >
              <ArrowUp data-icon="inline-start" />
              Envoyer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  )
}
