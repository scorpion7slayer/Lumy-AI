import { createFileRoute } from "@tanstack/react-router"
import { requireRequestUser } from "@/lib/auth.server"
import { getModelCatalog } from "@/lib/model-catalog.server"

export const Route = createFileRoute("/api/models")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        await requireRequestUser(request)
        return Response.json(await getModelCatalog())
      },
    },
  },
})
