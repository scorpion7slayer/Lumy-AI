import { useState } from "react"
import { MessageSquareHeart, Send } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldLabel } from "@/components/ui/field"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"

export function FeedbackDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [category, setCategory] = useState<"idea" | "bug" | "other">("idea")
  const [message, setMessage] = useState("")
  const [sending, setSending] = useState(false)

  const send = async () => {
    setSending(true)
    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category, message }),
      })
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string
      }
      if (!response.ok) throw new Error(payload.error ?? "Envoi impossible.")
      setMessage("")
      onOpenChange(false)
      toast.success(
        "Merci, votre commentaire a été transmis à l’administrateur."
      )
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Envoi impossible.")
    } finally {
      setSending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-editorial text-2xl">
            <MessageSquareHeart className="size-5 text-primary" />
            Donner votre avis
          </DialogTitle>
          <DialogDescription>
            Votre commentaire sera visible uniquement par les administrateurs.
          </DialogDescription>
        </DialogHeader>
        <Field>
          <FieldLabel>Type de commentaire</FieldLabel>
          <Select
            value={category}
            onValueChange={(value) =>
              setCategory(value as "idea" | "bug" | "other")
            }
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="idea">Idée ou amélioration</SelectItem>
              <SelectItem value="bug">Problème rencontré</SelectItem>
              <SelectItem value="other">Autre commentaire</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field>
          <FieldLabel htmlFor="feedback-message">Votre commentaire</FieldLabel>
          <Textarea
            id="feedback-message"
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder="Dites-nous ce qui fonctionne bien ou ce qui devrait changer…"
            minLength={10}
            maxLength={2_000}
            className="min-h-32"
          />
          <p className="text-right text-xs text-muted-foreground">
            {message.length} / 2 000
          </p>
        </Field>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button
            onClick={send}
            disabled={sending || message.trim().length < 10}
          >
            {sending ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <Send data-icon="inline-start" />
            )}
            Envoyer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
