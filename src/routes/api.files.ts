import { randomUUID } from "node:crypto"
import { createFileRoute } from "@tanstack/react-router"
import { assertSameOrigin, requireRequestUser } from "@/lib/auth.server"
import { insertFile } from "@/lib/db.server"
import type { SessionFile } from "@/lib/chat-types"

const MAX_FILE_SIZE = 10 * 1024 * 1024
const MAX_FILES = 5
const ACCEPTED_TYPES = new Set([
  "application/json",
  "application/pdf",
  "application/xml",
  "text/csv",
  "text/markdown",
  "text/plain",
  "text/xml",
])

export const Route = createFileRoute("/api/files")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        assertSameOrigin(request)
        const user = await requireRequestUser(request)
        const form = await request.formData()
        const conversationId = form.get("conversationId")
        const files = form
          .getAll("files")
          .filter((value): value is File => value instanceof File)

        if (typeof conversationId !== "string" || !conversationId) {
          return Response.json(
            { error: "Conversation requise." },
            { status: 400 }
          )
        }
        if (files.length === 0 || files.length > MAX_FILES) {
          return Response.json(
            { error: `Ajoutez entre 1 et ${MAX_FILES} fichiers.` },
            { status: 400 }
          )
        }

        const saved: SessionFile[] = []
        for (const file of files) {
          if (file.size > MAX_FILE_SIZE) {
            return Response.json(
              { error: `${file.name} dépasse 10 Mo.` },
              { status: 413 }
            )
          }
          if (
            !file.type.startsWith("text/") &&
            !ACCEPTED_TYPES.has(file.type)
          ) {
            return Response.json(
              { error: `${file.name} utilise un format non pris en charge.` },
              { status: 415 }
            )
          }

          const id = randomUUID()
          const name =
            file.name.replace(/[\\/]/g, "-").slice(0, 255) || "document"
          await insertFile({
            id,
            userId: user.id,
            conversationId,
            name,
            type: file.type || "application/octet-stream",
            size: file.size,
            content: Buffer.from(await file.arrayBuffer()),
          })
          saved.push({
            id,
            conversationId,
            name,
            size: file.size,
            type: file.type,
          })
        }

        return Response.json({ files: saved }, { status: 201 })
      },
    },
  },
})
