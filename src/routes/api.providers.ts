import { createFileRoute } from "@tanstack/react-router"
import { requireRequestUser } from "@/lib/auth.server"
import { providerIds } from "@/lib/providers"
import { getProviderConfig } from "@/lib/providers.server"

export const Route = createFileRoute("/api/providers")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        await requireRequestUser(request)
        return Response.json(
          Object.fromEntries(
            providerIds.map((provider) => [
              provider,
              Boolean(getProviderConfig(provider).apiKey),
            ])
          )
        )
      },
    },
  },
})
