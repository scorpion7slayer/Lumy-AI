import { createFileRoute } from "@tanstack/react-router"
import { assertSameOrigin, requireRequestUser } from "@/lib/auth.server"
import { deleteFile, findFile } from "@/lib/db.server"

export const Route = createFileRoute("/api/files/$fileId")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const user = await requireRequestUser(request)
        const file = await findFile(user.id, params.fileId)
        if (!file)
          return Response.json(
            { error: "Fichier introuvable." },
            { status: 404 }
          )

        return new Response(new Blob([new Uint8Array(file.content)]), {
          headers: {
            "Content-Type": file.mime_type,
            "Content-Length": String(file.size),
            "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(file.name)}`,
            "Cache-Control": "private, max-age=300",
            "X-Content-Type-Options": "nosniff",
          },
        })
      },
      DELETE: async ({ request, params }) => {
        assertSameOrigin(request)
        const user = await requireRequestUser(request)
        const deleted = await deleteFile(user.id, params.fileId)
        return deleted
          ? new Response(null, { status: 204 })
          : Response.json({ error: "Fichier introuvable." }, { status: 404 })
      },
    },
  },
})
