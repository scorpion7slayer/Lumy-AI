import { createFileRoute } from "@tanstack/react-router"
import { requireSuperAdmin } from "@/lib/auth.server"
import { findFileForAdmin } from "@/lib/db.server"

export const Route = createFileRoute("/api/admin/files/$fileId")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        await requireSuperAdmin(request)
        const file = await findFileForAdmin(params.fileId)
        if (!file) {
          return Response.json(
            { error: "Fichier introuvable." },
            { status: 404 }
          )
        }
        return new Response(new Blob([new Uint8Array(file.content)]), {
          headers: {
            "Content-Type": file.mime_type,
            "Content-Length": String(file.size),
            "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`,
            "Cache-Control": "private, no-store",
            "X-Content-Type-Options": "nosniff",
            "Content-Security-Policy": "sandbox; default-src 'none'",
          },
        })
      },
    },
  },
})
