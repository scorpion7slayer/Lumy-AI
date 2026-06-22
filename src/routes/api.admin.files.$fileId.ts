import { createFileRoute } from "@tanstack/react-router"
import { requireAdmin } from "@/lib/auth.server"
import { findFileForAdmin } from "@/lib/db.server"

export const Route = createFileRoute("/api/admin/files/$fileId")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        await requireAdmin(request)
        const file = await findFileForAdmin(params.fileId)
        if (!file) {
          return Response.json(
            { error: "Fichier introuvable." },
            { status: 404 }
          )
        }
        const forceDownload = ["text/html", "image/svg+xml"].includes(
          file.mime_type.toLowerCase()
        )
        return new Response(new Blob([new Uint8Array(file.content)]), {
          headers: {
            "Content-Type": file.mime_type,
            "Content-Length": String(file.size),
            "Content-Disposition": `${forceDownload ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(file.name)}`,
            "Cache-Control": "private, no-store",
            "X-Content-Type-Options": "nosniff",
            "Content-Security-Policy": "sandbox; default-src 'none'",
          },
        })
      },
    },
  },
})
