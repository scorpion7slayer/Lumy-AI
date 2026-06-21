import { useState } from "react"
import {
  ExternalLink,
  FileText,
  Gauge,
  MemoryStick,
  Paperclip,
  Trash2,
  X,
} from "lucide-react"
import type { ChatModel, MemoryItem, SessionFile } from "@/lib/chat-types"
import { Button } from "@/components/ui/button"
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import { ModelIcon } from "@/components/chat/model-icon"
import { Progress } from "@/components/ui/progress"
import { formatTokenCount } from "@/lib/model-format"

function formatDate(value: string) {
  return new Intl.DateTimeFormat("fr-BE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(value))
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} o`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`
  return `${(bytes / 1024 / 1024).toFixed(1)} Mo`
}

export function SessionPanel({
  model,
  contextTokens,
  memories,
  files,
  onToggleMemory,
  onOpenMemory,
  onAddFiles,
  onRemoveFile,
  onCloseMobile,
}: {
  model: ChatModel | null
  contextTokens: number
  memories: MemoryItem[]
  files: SessionFile[]
  onToggleMemory: (id: string) => void
  onOpenMemory: () => void
  onAddFiles: (files: FileList | null) => void
  onRemoveFile: (id: string) => void
  onCloseMobile?: () => void
}) {
  const [deletingFile, setDeletingFile] = useState<SessionFile | null>(null)
  const contextPercentage = model?.contextWindow
    ? Math.min(100, (contextTokens / model.contextWindow) * 100)
    : 0
  const activeMemoryCount = memories.filter((memory) => memory.enabled).length
  const activeMemoryLabel =
    activeMemoryCount === 0
      ? "Aucune active"
      : activeMemoryCount === 1
        ? "1 active"
        : `${activeMemoryCount} actives`
  const fileCountLabel =
    files.length === 0
      ? "Aucun"
      : files.length === 1
        ? "1 fichier"
        : `${files.length} fichiers`

  return (
    <>
      <aside className="flex h-full min-h-0 flex-col bg-background">
        <div className="flex h-[76px] items-center justify-between px-6">
          <h2 className="font-editorial text-[22px] font-semibold">Contexte</h2>
          {onCloseMobile ? (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={onCloseMobile}
              aria-label="Fermer le contexte"
            >
              <X />
            </Button>
          ) : null}
        </div>
        <Separator />
        <ScrollArea className="min-h-0 flex-1">
          <div className="flex flex-col px-6 pb-8">
            <section className="py-6">
              <div className="flex items-start gap-3">
                {model ? (
                  <ModelIcon model={model} className="size-8" />
                ) : (
                  <span className="mt-1 size-3 rounded-full bg-muted-foreground/35" />
                )}
                <div>
                  <h3 className="text-sm font-medium">Modèle utilisé</h3>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    {model?.name ?? "Aucun modèle détecté"}
                  </p>
                </div>
              </div>
              <div className="mt-5 rounded-xl border border-border bg-muted/25 p-3.5">
                <div className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-2 text-xs font-medium">
                    <Gauge className="size-3.5 text-muted-foreground" />
                    Fenêtre de contexte
                  </span>
                  <span className="text-xs font-semibold">
                    {model
                      ? `${formatTokenCount(model.contextWindow)} jetons`
                      : "Indisponible"}
                  </span>
                </div>
                {model ? (
                  <>
                    <div className="mt-3 flex items-center justify-between text-[11px] text-muted-foreground">
                      <span>Utilisation estimée</span>
                      <span>
                        {formatTokenCount(contextTokens, false)} /{" "}
                        {formatTokenCount(model.contextWindow)}
                      </span>
                    </div>
                    <Progress
                      value={contextPercentage}
                      className="mt-2 h-1.5"
                      aria-label={`${contextPercentage.toFixed(1)} % de la fenêtre de contexte utilisée`}
                    />
                    <p className="mt-2 text-[10px] leading-4 text-muted-foreground">
                      Estimation basée sur les messages et mémoires actifs. Les
                      instructions système et fichiers peuvent faire varier le
                      total réel.
                    </p>
                  </>
                ) : null}
              </div>
            </section>

            <Separator />
            <section className="py-6">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-sm font-medium">Mémoire</h3>
                <span className="text-xs text-muted-foreground">
                  {activeMemoryLabel}
                </span>
              </div>
              {memories.length ? (
                <div className="flex flex-col gap-3">
                  {memories.map((memory) => (
                    <div key={memory.id} className="flex items-start gap-3">
                      <MemoryStick className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-medium">
                          {memory.title}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          Mis à jour le {formatDate(memory.updatedAt)}
                        </p>
                      </div>
                      <Switch
                        checked={memory.enabled}
                        onCheckedChange={() => onToggleMemory(memory.id)}
                        aria-label={`Utiliser la mémoire ${memory.title}`}
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs leading-5 text-muted-foreground">
                  Rien n’est mémorisé pour le moment.
                </p>
              )}
              <Button variant="outline" className="mt-5" onClick={onOpenMemory}>
                <MemoryStick data-icon="inline-start" />
                Gérer la mémoire
              </Button>
            </section>

            <Separator />
            <section className="py-6">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-sm font-medium">Fichiers</h3>
                <span className="text-xs text-muted-foreground">
                  {fileCountLabel}
                </span>
              </div>
              {files.length > 0 ? (
                <div className="flex flex-col gap-2">
                  {files.map((file) => (
                    <div
                      key={file.id}
                      className="flex items-center gap-3 rounded-lg border border-border p-3"
                    >
                      <FileText className="size-4 shrink-0 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[12px] font-medium">
                          {file.name}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          {formatBytes(file.size)}
                        </p>
                      </div>
                      <Button variant="ghost" size="icon-xs" asChild>
                        <a
                          href={`/api/files/${encodeURIComponent(file.id)}`}
                          target="_blank"
                          rel="noreferrer"
                          aria-label={`Ouvrir ${file.name}`}
                        >
                          <ExternalLink />
                        </a>
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        onClick={() => setDeletingFile(file)}
                        aria-label={`Retirer ${file.name}`}
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs leading-5 text-muted-foreground">
                  Aucun fichier dans cette discussion.
                </p>
              )}
              <Button variant="outline" className="mt-4" asChild>
                <label>
                  <Paperclip data-icon="inline-start" />
                  Ajouter des fichiers
                  <input
                    type="file"
                    multiple
                    accept=".txt,.md,.csv,.json,.xml,.pdf,text/*,application/json,application/xml,application/pdf"
                    className="sr-only"
                    onChange={(event) => onAddFiles(event.target.files)}
                  />
                </label>
              </Button>
            </section>
          </div>
        </ScrollArea>
      </aside>
      <ConfirmDeleteDialog
        open={Boolean(deletingFile)}
        onOpenChange={(isOpen) => {
          if (!isOpen) setDeletingFile(null)
        }}
        title="Supprimer ce fichier ?"
        description={
          deletingFile
            ? `« ${deletingFile.name} » sera retiré de cette discussion et de votre bibliothèque.`
            : "Ce fichier sera supprimé définitivement."
        }
        onConfirm={async () => {
          if (deletingFile) await onRemoveFile(deletingFile.id)
          setDeletingFile(null)
        }}
      />
    </>
  )
}
