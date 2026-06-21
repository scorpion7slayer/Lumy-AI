import { useState } from "react"
import { Download, FileText, Library, Trash2 } from "lucide-react"
import type { Conversation, SessionFile } from "@/lib/chat-types"
import { Button } from "@/components/ui/button"
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { ScrollArea } from "@/components/ui/scroll-area"

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} o`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`
  return `${(bytes / 1024 / 1024).toFixed(1)} Mo`
}

export function LibraryDialog({
  open,
  onOpenChange,
  files,
  conversations,
  onRemove,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  files: SessionFile[]
  conversations: Conversation[]
  onRemove: (id: string) => void | Promise<void>
}) {
  const [deletingFile, setDeletingFile] = useState<SessionFile | null>(null)
  const conversationName = (id: string) =>
    conversations.find((conversation) => conversation.id === id)?.title ??
    "Conversation supprimée"

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[720px]">
          <DialogHeader>
            <DialogTitle className="font-editorial text-2xl">
              Bibliothèque
            </DialogTitle>
            <DialogDescription>
              Tous les documents stockés dans votre espace Lumy.
            </DialogDescription>
          </DialogHeader>
          {files.length === 0 ? (
            <Empty className="min-h-64 border">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Library />
                </EmptyMedia>
                <EmptyTitle>Aucun document</EmptyTitle>
                <EmptyDescription>
                  Ajoutez un fichier depuis la zone de message pour le retrouver
                  ici.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <ScrollArea className="max-h-[440px] pr-3">
              <div className="flex flex-col gap-2">
                {files.map((file) => (
                  <div
                    key={file.id}
                    className="flex items-center gap-3 rounded-lg border border-border p-3"
                  >
                    <FileText className="size-5 shrink-0 text-primary" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {file.name}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {conversationName(file.conversationId)} ·{" "}
                        {formatBytes(file.size)}
                      </p>
                    </div>
                    <Button variant="ghost" size="icon-sm" asChild>
                      <a
                        href={`/api/files/${encodeURIComponent(file.id)}`}
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
                      onClick={() => setDeletingFile(file)}
                      aria-label={`Supprimer ${file.name}`}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </DialogContent>
      </Dialog>
      <ConfirmDeleteDialog
        open={Boolean(deletingFile)}
        onOpenChange={(isOpen) => {
          if (!isOpen) setDeletingFile(null)
        }}
        title="Supprimer ce fichier ?"
        description={
          deletingFile
            ? `« ${deletingFile.name} » sera retiré de votre bibliothèque et de sa discussion.`
            : "Ce fichier sera supprimé définitivement."
        }
        onConfirm={async () => {
          if (deletingFile) await onRemove(deletingFile.id)
          setDeletingFile(null)
        }}
      />
    </>
  )
}
