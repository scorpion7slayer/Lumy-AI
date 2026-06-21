import { createFileRoute } from "@tanstack/react-router"
import { requireRequestUser } from "@/lib/auth.server"
import { checkDatabase, isDatabaseConfigured } from "@/lib/db.server"

export const Route = createFileRoute("/api/database")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        await requireRequestUser(request)
        if (!isDatabaseConfigured()) {
          return Response.json(
            { connected: false, configured: false },
            { status: 503 }
          )
        }

        try {
          await checkDatabase()
          return Response.json({ connected: true, configured: true })
        } catch (error) {
          console.error("[Lumy] Échec de la connexion MySQL", error)
          return Response.json(
            {
              connected: false,
              configured: true,
              error: "Connexion MySQL impossible.",
            },
            { status: 503 }
          )
        }
      },
    },
  },
})
