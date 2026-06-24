import {
  lazy,
  memo,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { toast } from "sonner"
import {
  ArrowUp,
  BrainCircuit,
  ChevronDown,
  Copy,
  Expand,
  ExternalLink,
  FileText,
  FileUp,
  Globe2,
  Link2,
  LoaderCircle,
  MessagesSquare,
  Mic,
  Paperclip,
  Search,
  Shuffle,
  Square,
  X,
} from "lucide-react"
import type {
  ChatMessage,
  ChatModel,
  Conversation,
  MemoryItem,
  ReflectionLevel,
  SessionFile,
  WebSearchMode,
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
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

function formatFileSize(bytes: number) {
  if (bytes < 1_024) return `${bytes} o`
  if (bytes < 1024 * 1024)
    return `${(bytes / 1_024).toLocaleString("fr-FR", {
      maximumFractionDigits: 1,
    })} Ko`
  return `${(bytes / (1024 * 1024)).toLocaleString("fr-FR", {
    maximumFractionDigits: 1,
  })} Mo`
}

function FileReferenceChip({
  file,
  onRemove,
  removable = false,
  motion = false,
}: {
  file: Pick<SessionFile, "id" | "name" | "size" | "type">
  onRemove?: () => void
  removable?: boolean
  motion?: boolean
}) {
  return (
    <span
      data-file-chip={motion ? "composer" : undefined}
      className="inline-flex max-w-full min-w-0 items-center gap-1.5 rounded-lg border border-border bg-muted/45 px-2 py-1 text-xs text-muted-foreground"
    >
      <FileText className="size-3.5 shrink-0" />
      <span className="min-w-0 truncate" title={file.name}>
        {file.name}
      </span>
      <span className="shrink-0 text-[11px]">{formatFileSize(file.size)}</span>
      {removable ? (
        <button
          type="button"
          className="grid size-5 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          onClick={onRemove}
          aria-label={`Retirer ${file.name}`}
        >
          <X className="size-3" />
        </button>
      ) : null}
    </span>
  )
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
      {message.webSearchExecuted && message.webSources?.length ? (
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 px-2 text-xs"
              aria-label={`${message.webSources.length} source${message.webSources.length > 1 ? "s" : ""} utilisée${message.webSources.length > 1 ? "s" : ""}`}
            >
              <Globe2 />
              {message.webSources.length} source
              {message.webSources.length > 1 ? "s" : ""}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-80 gap-1 p-2">
            <p className="px-2 py-1 text-xs font-medium text-muted-foreground">
              Sources consultées
            </p>
            {message.webSources.map((source) => (
              <a
                key={source.url}
                href={source.url}
                target="_blank"
                rel="noreferrer"
                className="flex min-w-0 items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-accent"
              >
                <span className="min-w-0 flex-1 truncate">{source.title}</span>
                <ExternalLink className="size-3.5 shrink-0 text-muted-foreground" />
              </a>
            ))}
          </PopoverContent>
        </Popover>
      ) : null}
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

const AssistantMessage = memo(function AssistantMessage({
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
})

const UserMessage = memo(function UserMessage({
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
        {message.reference ? (
          <span className="mb-2 inline-flex max-w-full items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
            <Link2 className="size-3.5 shrink-0" />
            <span className="truncate">
              Contexte : {message.reference.title}
            </span>
          </span>
        ) : null}
        {message.files?.length ? (
          <div className="mb-3 flex flex-wrap gap-1.5">
            {message.files.map((file) => (
              <FileReferenceChip key={file.id} file={file} />
            ))}
          </div>
        ) : null}
        <p className="text-[15px] leading-7 whitespace-pre-wrap">
          {message.content}
        </p>
      </div>
    </article>
  )
})

const ConversationMessage = memo(function ConversationMessage({
  message,
  initials,
  memories,
  separated,
}: {
  message: ChatMessage
  initials: string
  memories: MemoryItem[]
  separated: boolean
}) {
  return (
    <div className="chat-message-shell">
      {message.role === "user" ? (
        <UserMessage message={message} initials={initials} />
      ) : (
        <AssistantMessage message={message} memories={memories} />
      )}
      {separated ? <Separator className="mt-9" /> : null}
    </div>
  )
})

export function ConversationView({
  conversation,
  isGenerating,
  model,
  modelAvailable,
  memories,
  conversations,
  webSearchMode,
  webSearchAvailable,
  reflection,
  onWebSearchChange,
  onReflectionChange,
  onSend,
  onStop,
  onAddFiles,
  onRemoveFile,
  files,
  userName,
  userId,
}: {
  conversation: Conversation | null
  isGenerating: boolean
  model: ChatModel | null
  modelAvailable: boolean
  memories: MemoryItem[]
  conversations: Conversation[]
  webSearchMode: WebSearchMode
  webSearchAvailable: boolean
  reflection: ReflectionLevel
  onWebSearchChange: (value: WebSearchMode) => void
  onReflectionChange: (value: ReflectionLevel) => void
  onSend: (
    content: string,
    referencedConversationId?: string,
    referencedFileIds?: string[]
  ) => void
  onStop: () => void
  onAddFiles: (files: FileList | null) => void
  onRemoveFile: (id: string) => void
  files: SessionFile[]
  userName: string
  userId?: string
}) {
  const [draft, setDraft] = useState("")
  const [expanded, setExpanded] = useState(false)
  const [dictating, setDictating] = useState(false)
  const [atBottom, setAtBottom] = useState(true)
  const [draggingFiles, setDraggingFiles] = useState(false)
  const [selectedReferenceId, setSelectedReferenceId] = useState<string>()
  const [referencedFileIds, setReferencedFileIds] = useState<string[]>([])
  const [fileReferenceOpen, setFileReferenceOpen] = useState(false)
  const [visibleMessageCount, setVisibleMessageCount] = useState(80)
  const [aboutOpen, setAboutOpen] = useState(false)
  const [changelogOpen, setChangelogOpen] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const composerFilesRef = useRef<HTMLDivElement>(null)
  const fileChipMotionRef = useRef<{ revert: () => void } | null>(null)
  const stickToBottomRef = useRef(true)
  const dragDepthRef = useRef(0)
  const messages = conversation?.messages ?? []
  const hiddenMessageCount = Math.max(0, messages.length - visibleMessageCount)
  const visibleMessages = useMemo(
    () => messages.slice(hiddenMessageCount),
    [hiddenMessageCount, messages]
  )
  const referenceOptions = useMemo(
    () =>
      conversations.filter(
        (candidate) =>
          candidate.id !== conversation?.id && candidate.messages.length > 0
      ),
    [conversation?.id, conversations]
  )
  const selectedReference = referenceOptions.find(
    (candidate) => candidate.id === selectedReferenceId
  )
  const pendingFiles = files.filter((file) => file.pending)
  const sentFiles = files.filter((file) => !file.pending)
  const referencedFiles = referencedFileIds.flatMap((id) => {
    const file = files.find((item) => item.id === id)
    return file ? [file] : []
  })
  const mentionQuery = (() => {
    const match = /(?:^|\s)@([^\n@]*)$/u.exec(draft)
    return match ? match[1].trim().toLocaleLowerCase("fr") : null
  })()
  const fileReferenceOptions =
    mentionQuery === null
      ? []
      : sentFiles
          .filter((file) => !referencedFileIds.includes(file.id))
          .filter((file) =>
            file.name.toLocaleLowerCase("fr").includes(mentionQuery)
          )
          .slice(0, 6)
  const reasoningLevels = model?.reasoningLevels ?? []
  const initials =
    userName
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join("") || "U"

  useEffect(() => {
    try {
      if (
        userId &&
        window.localStorage.getItem(
          `lumy.early-access.welcome.v1:${userId}`
        ) !== "seen"
      ) {
        setChangelogOpen(true)
      }
    } catch {
      // The welcome can safely wait when local storage is unavailable.
    }
  }, [userId])

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
    setVisibleMessageCount(80)
    setReferencedFileIds([])
    setFileReferenceOpen(false)
    setSelectedReferenceId(
      conversation?.messages
        .slice()
        .reverse()
        .find((message) => message.reference)?.reference?.conversationId
    )
    const frame = requestAnimationFrame(() => scrollToBottom("auto"))
    return () => cancelAnimationFrame(frame)
    // A newly selected conversation always opens on its latest message.
  }, [conversation?.id])

  useEffect(() => {
    if (!stickToBottomRef.current) return
    const frame = requestAnimationFrame(() => scrollToBottom("auto"))
    return () => cancelAnimationFrame(frame)
  }, [messages])

  useEffect(() => {
    const element = composerFilesRef.current
    fileChipMotionRef.current?.revert()
    fileChipMotionRef.current = null
    if (!element || (!pendingFiles.length && !referencedFiles.length)) return
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
    let cancelled = false
    void import("animejs").then(({ animate, createScope, stagger }) => {
      if (cancelled || !composerFilesRef.current) return
      fileChipMotionRef.current = createScope({ root: composerFilesRef }).add(
        () => {
          animate("[data-file-chip='composer']", {
            opacity: [0, 1],
            y: [6, 0],
            scale: [0.98, 1],
            delay: stagger(30),
            duration: 220,
            ease: "out(3)",
          })
        }
      )
    })
    return () => {
      cancelled = true
      fileChipMotionRef.current?.revert()
      fileChipMotionRef.current = null
    }
  }, [pendingFiles.length, referencedFiles.length])

  const handleScroll = () => {
    const element = scrollRef.current
    if (!element) return
    const bottomDistance =
      element.scrollHeight - element.scrollTop - element.clientHeight
    const isAtBottom = bottomDistance <= 72
    stickToBottomRef.current = isAtBottom
    setAtBottom(isAtBottom)
  }

  const addReferencedFile = (file: SessionFile) => {
    setReferencedFileIds((current) =>
      current.includes(file.id) ? current : [...current, file.id]
    )
    const atIndex = draft.lastIndexOf("@")
    setDraft((current) => {
      const index = current.lastIndexOf("@")
      if (index < 0) return `${current} @${file.name} `
      return `${current.slice(0, index)}@${file.name} `
    })
    if (atIndex >= 0) setFileReferenceOpen(false)
  }

  const submit = () => {
    if ((!draft.trim() && pendingFiles.length === 0) || isGenerating) return
    stickToBottomRef.current = true
    setAtBottom(true)
    onSend(draft, selectedReferenceId, referencedFileIds)
    setDraft("")
    setReferencedFileIds([])
    setFileReferenceOpen(false)
    setExpanded(false)
  }

  const hasDraggedFiles = (event: React.DragEvent) =>
    Array.from(event.dataTransfer.types).includes("Files")

  const handleDragEnter = (event: React.DragEvent<HTMLElement>) => {
    if (!hasDraggedFiles(event)) return
    event.preventDefault()
    dragDepthRef.current += 1
    setDraggingFiles(true)
  }

  const handleDragLeave = (event: React.DragEvent<HTMLElement>) => {
    if (!hasDraggedFiles(event)) return
    event.preventDefault()
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1)
    if (dragDepthRef.current === 0) setDraggingFiles(false)
  }

  const handleDrop = (event: React.DragEvent<HTMLElement>) => {
    if (!hasDraggedFiles(event)) return
    event.preventDefault()
    dragDepthRef.current = 0
    setDraggingFiles(false)
    if (event.dataTransfer.files.length) onAddFiles(event.dataTransfer.files)
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
    <main
      className="relative flex min-h-0 min-w-0 flex-1 flex-col bg-background"
      onDragEnter={handleDragEnter}
      onDragOver={(event) => {
        if (hasDraggedFiles(event)) event.preventDefault()
      }}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {draggingFiles ? (
        <div className="pointer-events-none absolute inset-3 z-40 grid place-items-center rounded-2xl border-2 border-dashed border-primary bg-background/90 backdrop-blur-sm">
          <div className="text-center">
            <FileUp className="mx-auto mb-3 size-8 text-primary" />
            <p className="font-medium">Déposez vos fichiers ici</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Images, documents, code et archives compatibles
            </p>
          </div>
        </div>
      ) : null}
      <div
        ref={scrollRef}
        data-testid="conversation-scroll"
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
        onScroll={handleScroll}
      >
        {messages.length > 0 ? (
          <div className="mx-auto flex w-full max-w-[820px] flex-col gap-9 px-8 pt-14 pb-10 max-sm:px-5">
            {hiddenMessageCount > 0 ? (
              <Button
                variant="outline"
                className="mx-auto"
                onClick={() =>
                  setVisibleMessageCount((current) => current + 50)
                }
              >
                Afficher 50 messages précédents
                <span className="text-muted-foreground">
                  ({hiddenMessageCount} masqués)
                </span>
              </Button>
            ) : null}
            {visibleMessages.map((message, index) => (
              <ConversationMessage
                key={message.id}
                message={message}
                initials={initials}
                memories={memories}
                separated={index < visibleMessages.length - 1}
              />
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
            {pendingFiles.length || referencedFiles.length ? (
              <div
                ref={composerFilesRef}
                className="mb-2 flex flex-wrap gap-1.5"
              >
                {pendingFiles.map((file) => (
                  <FileReferenceChip
                    key={file.id}
                    file={file}
                    removable
                    motion
                    onRemove={() => onRemoveFile(file.id)}
                  />
                ))}
                {referencedFiles.map((file) => (
                  <FileReferenceChip
                    key={file.id}
                    file={file}
                    removable
                    motion
                    onRemove={() =>
                      setReferencedFileIds((current) =>
                        current.filter((id) => id !== file.id)
                      )
                    }
                  />
                ))}
              </div>
            ) : null}
            <div className="flex items-start gap-2">
              <Textarea
                value={draft}
                onChange={(event) => {
                  const value = event.target.value
                  setDraft(value)
                  setFileReferenceOpen(/(?:^|\s)@[^\n@]*$/u.test(value))
                }}
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
            {fileReferenceOpen && fileReferenceOptions.length ? (
              <div className="mt-2 max-h-40 overflow-y-auto rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-sm">
                <p className="px-2 py-1 text-xs font-medium text-muted-foreground">
                  Référencer un fichier
                </p>
                {fileReferenceOptions.map((file) => (
                  <button
                    key={file.id}
                    type="button"
                    className="flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
                    onClick={() => addReferencedFile(file)}
                  >
                    <FileText className="size-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate">{file.name}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {formatFileSize(file.size)}
                    </span>
                  </button>
                ))}
              </div>
            ) : null}
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <Button variant="outline" size="icon" asChild>
                <label aria-label="Joindre des fichiers">
                  <Paperclip />
                  <input
                    type="file"
                    multiple
                    accept={CHAT_FILE_ACCEPT}
                    className="sr-only"
                    onChange={(event) => {
                      onAddFiles(event.target.files)
                      event.currentTarget.value = ""
                    }}
                  />
                </label>
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    disabled={!webSearchAvailable}
                    aria-label={
                      webSearchMode === "off"
                        ? "Recherche web désactivée"
                        : webSearchMode === "on"
                          ? "Recherche web activée"
                          : "Recherche web automatique"
                    }
                  >
                    {webSearchMode === "off" ? (
                      <Search />
                    ) : webSearchMode === "on" ? (
                      <Globe2 />
                    ) : (
                      <Shuffle />
                    )}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-64">
                  <DropdownMenuLabel>Mode de recherche web</DropdownMenuLabel>
                  <DropdownMenuRadioGroup
                    value={webSearchMode}
                    onValueChange={(value) =>
                      onWebSearchChange(value as WebSearchMode)
                    }
                  >
                    <DropdownMenuRadioItem value="off">
                      <div>
                        <p>Recherche web désactivée</p>
                        <p className="text-xs text-muted-foreground">
                          Répond sans consulter Internet
                        </p>
                      </div>
                    </DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="on">
                      <div>
                        <p>Recherche web activée</p>
                        <p className="text-xs text-muted-foreground">
                          Recherche pour la prochaine demande
                        </p>
                      </div>
                    </DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="auto">
                      <div>
                        <p>Recherche web auto</p>
                        <p className="text-xs text-muted-foreground">
                          Lumy décide selon votre question
                        </p>
                      </div>
                    </DropdownMenuRadioItem>
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant={selectedReference ? "secondary" : "outline"}
                    disabled={referenceOptions.length === 0}
                    aria-label="Référencer une conversation"
                    className="max-w-60 max-sm:w-8 max-sm:px-0"
                  >
                    <MessagesSquare data-icon="inline-start" />
                    <span className="truncate max-sm:sr-only">
                      {selectedReference
                        ? selectedReference.title
                        : "Référencer un chat"}
                    </span>
                    <ChevronDown
                      data-icon="inline-end"
                      className="max-sm:hidden"
                    />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-72">
                  <DropdownMenuLabel>
                    Ajouter le contexte d’une discussion
                  </DropdownMenuLabel>
                  <DropdownMenuRadioGroup
                    value={selectedReferenceId}
                    onValueChange={setSelectedReferenceId}
                  >
                    {referenceOptions.map((candidate) => (
                      <DropdownMenuRadioItem
                        key={candidate.id}
                        value={candidate.id}
                      >
                        <span className="truncate" title={candidate.title}>
                          {candidate.title}
                        </span>
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>
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
                      className="w-[142px] max-sm:min-w-0 max-sm:flex-1"
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
                    className="flex h-8 min-w-[142px] items-center rounded-md border border-border bg-muted/35 px-3 text-xs text-muted-foreground max-sm:min-w-0 max-sm:flex-1"
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
                    disabled={
                      (!draft.trim() && pendingFiles.length === 0) ||
                      !modelAvailable
                    }
                    aria-label="Envoyer le message"
                  >
                    <ArrowUp />
                  </Button>
                )}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 pt-2 text-center text-[10px] text-muted-foreground">
            <span>
              Lumy peut se tromper. Vérifiez les informations importantes.
            </span>
            <span className="max-sm:hidden" aria-hidden="true">
              ·
            </span>
            <span className="max-sm:hidden">© 2026 Lumy AI By Zyranex</span>
            <button
              type="button"
              className="underline-offset-2 hover:underline max-sm:hidden"
              onClick={() => setAboutOpen(true)}
            >
              Crédits
            </button>
            <button
              type="button"
              className="underline-offset-2 hover:underline max-sm:hidden"
              onClick={() => setChangelogOpen(true)}
            >
              Nouveautés
            </button>
          </div>
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
              disabled={
                (!draft.trim() && pendingFiles.length === 0) ||
                isGenerating ||
                !modelAvailable
              }
            >
              <ArrowUp data-icon="inline-start" />
              Envoyer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={aboutOpen} onOpenChange={setAboutOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-editorial text-2xl">
              Crédits
            </DialogTitle>
            <DialogDescription>
              Les personnes et projets derrière Lumy.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-xl border border-border bg-muted/35 p-4">
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Développement web
            </p>
            <p className="mt-2 font-medium">scorpion7slayer - ou / nxtaigen</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Développeur principal
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button variant="outline" size="sm" asChild>
                <a
                  href="https://github.com/scorpion7slayer"
                  target="_blank"
                  rel="noreferrer"
                >
                  GitHub <ExternalLink data-icon="inline-end" />
                </a>
              </Button>
              <Button variant="outline" size="sm" asChild>
                <a href="https://nxtaigen.com" target="_blank" rel="noreferrer">
                  nxtaigen.com <ExternalLink data-icon="inline-end" />
                </a>
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog
        open={changelogOpen}
        onOpenChange={(open) => {
          setChangelogOpen(open)
          if (!open && userId) {
            try {
              window.localStorage.setItem(
                `lumy.early-access.welcome.v1:${userId}`,
                "seen"
              )
            } catch {
              // The welcome can safely reappear when storage is unavailable.
            }
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-editorial text-2xl">
              Bienvenue dans l’Early Access
            </DialogTitle>
            <DialogDescription>
              Merci de découvrir Lumy en avance. Vos retours aident à améliorer
              le produit avant son ouverture publique.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <section className="rounded-xl border border-border p-4">
              <p className="text-xs font-medium tracking-wide text-primary uppercase">
                24 juin 2026
              </p>
              <h3 className="mt-1 font-medium">
                Interface et références plus fiables
              </h3>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6 text-muted-foreground">
                <li>
                  Recherche web verrouillée quand elle est désactivée, avec
                  sources affichées uniquement si une recherche a vraiment été
                  utilisée.
                </li>
                <li>
                  Fichiers ajoutés au-dessus de la saisie avant l’envoi, puis
                  liés au message comme référence.
                </li>
                <li>Références de fichiers avec @ dans la zone de texte.</li>
                <li>
                  Notifications navigateur avec autorisation et test système.
                </li>
                <li>
                  Historique, groupes, sélecteur de modèle et interface mobile
                  ajustés pour les titres longs.
                </li>
              </ul>
            </section>
            <p className="text-xs leading-5 text-muted-foreground">
              Cette fenêtre ne s’affiche automatiquement qu’une fois. Vous
              pouvez retrouver les annonces via « Nouveautés » sous le chat.
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </main>
  )
}
