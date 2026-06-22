import { createFileRoute } from "@tanstack/react-router"
import { requireRequestUser } from "@/lib/auth.server"
import { listModelControls } from "@/lib/db.server"
import { getModelCatalog } from "@/lib/model-catalog.server"

export const Route = createFileRoute("/api/models")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        await requireRequestUser(request)
        const [catalog, controls] = await Promise.all([
          getModelCatalog(),
          listModelControls(),
        ])
        const disabledProviders = new Set(
          controls
            .filter((control) => control.modelId === null && !control.enabled)
            .map((control) => control.provider)
        )
        const disabledModels = new Set(
          controls
            .filter((control) => control.modelId !== null && !control.enabled)
            .map((control) => `${control.provider}:${control.modelId}`)
        )
        const externalModels = catalog.models.filter(
          (model) =>
            model.provider !== "lumy" &&
            !disabledProviders.has(model.provider) &&
            !disabledModels.has(`${model.provider}:${model.id}`)
        )
        const lumyModels = catalog.models.filter(
          (model) => model.provider === "lumy"
        )
        const models = externalModels.length
          ? [...lumyModels, ...externalModels]
          : []
        return Response.json({
          ...catalog,
          models,
          providers: catalog.providers.filter(
            (provider) =>
              provider === "lumy" || !disabledProviders.has(provider)
          ),
          configuredProviders: catalog.configuredProviders.filter(
            (provider) => !disabledProviders.has(provider)
          ),
        })
      },
    },
  },
})
