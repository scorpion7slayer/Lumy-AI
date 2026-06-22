import { createFileRoute } from "@tanstack/react-router"
import { requireRequestUser } from "@/lib/auth.server"
import { listModelControls } from "@/lib/db.server"
import { providerIds } from "@/lib/providers"
import { getProviderConfig } from "@/lib/providers.server"

export const Route = createFileRoute("/api/providers")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        await requireRequestUser(request)
        const disabledProviders = new Set(
          (await listModelControls())
            .filter((control) => control.modelId === null && !control.enabled)
            .map((control) => control.provider)
        )
        return Response.json(
          Object.fromEntries(
            providerIds.map((provider) => [
              provider,
              Boolean(getProviderConfig(provider).apiKey) &&
                !disabledProviders.has(provider),
            ])
          )
        )
      },
    },
  },
})
