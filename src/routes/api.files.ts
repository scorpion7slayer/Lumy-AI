import { randomUUID } from "node:crypto"
import { createFileRoute } from "@tanstack/react-router"
import { assertSameOrigin, requireRequestUser } from "@/lib/auth.server"
import { insertFile } from "@/lib/db.server"
import {
  convertImageToWebp,
  ImageUploadError,
  looksLikeImageUpload,
} from "@/lib/image-upload.server"
import {
  isSupportedUploadFile,
  normalizeUploadMimeType,
} from "@/lib/file-support"
import type { SessionFile } from "@/lib/chat-types"

const MAX_FILE_SIZE = 10 * 1024 * 1024
const MAX_FILES = 5

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
          const isImage = looksLikeImageUpload(file)
          if (!isImage && !isSupportedUploadFile(file)) {
            return Response.json(
              { error: `${file.name} utilise un format non pris en charge.` },
              { status: 415 }
            )
          }

          const id = randomUUID()
          const sanitizedName =
            file.name.replace(/[\\/]/g, "-").slice(0, 255) || "document"
          let stored: {
            name: string
            type: string
            size: number
            content: Buffer
          } = {
            name: sanitizedName,
            type: normalizeUploadMimeType(file),
            size: file.size,
            content: Buffer.from(await file.arrayBuffer()),
          }
          if (isImage) {
            try {
              stored = await convertImageToWebp(
                stored.content,
                sanitizedName,
                MAX_FILE_SIZE
              )
            } catch (error) {
              if (error instanceof ImageUploadError) {
                return Response.json(
                  { error: error.message },
                  { status: error.status }
                )
              }
              throw error
            }
          }
          await insertFile({
            id,
            userId: user.id,
            conversationId,
            ...stored,
          })
          saved.push({
            id,
            conversationId,
            name: stored.name,
            size: stored.size,
            type: stored.type,
          })
        }

        return Response.json({ files: saved }, { status: 201 })
      },
    },
  },
})
