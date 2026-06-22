import { useEffect, useMemo, useRef, useState } from "react"
import {
  Check,
  ChevronDown,
  CircleAlert,
  LoaderCircle,
  Search,
} from "lucide-react"
import type { ChatModel, ProviderId } from "@/lib/chat-types"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { cn } from "@/lib/utils"
import { ModelIcon } from "@/components/chat/model-icon"
import type { PriceFilter, ProviderFilter } from "@/lib/model-filter"
import { filterModels } from "@/lib/model-filter"
import { formatTokenCount } from "@/lib/model-format"
import { providerLabels } from "@/lib/providers"

type ModelsPayload = {
  models?: ChatModel[]
  providers?: ProviderId[]
  configuredProviders?: ProviderId[]
}
export function ModelPicker({
  selectedModel,
  onSelect,
  onDetectionComplete,
}: {
  selectedModel: ChatModel | null
  onSelect: (model: ChatModel | null) => void
  onDetectionComplete: () => void
}) {
  const [open, setOpen] = useState(false)
  const [models, setModels] = useState<ChatModel[]>([])
  const [providers, setProviders] = useState<ProviderId[]>([])
  const [configuredProviders, setConfiguredProviders] = useState<ProviderId[]>(
    []
  )
  const [providerFilter, setProviderFilter] = useState<ProviderFilter>("all")
  const [query, setQuery] = useState("")
  const [priceFilter, setPriceFilter] = useState<PriceFilter>("all")
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading")
  const initialSelectedModel = useRef(selectedModel)

  useEffect(() => {
    const controller = new AbortController()
    fetch("/api/models", { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((payload: ModelsPayload) => {
        const detectedModels = payload.models ?? []
        const detectedProviders = payload.providers ?? []
        setModels(detectedModels)
        setProviders(detectedProviders)
        setConfiguredProviders(payload.configuredProviders ?? [])
        setStatus("ready")

        const initialModel = initialSelectedModel.current
        const savedModel = initialModel
          ? detectedModels.find(
              (model) =>
                model.id === initialModel.id &&
                model.provider === initialModel.provider
            )
          : null
        const nextModel = savedModel ?? detectedModels.at(0) ?? null
        onSelect(nextModel)
        onDetectionComplete()
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return
        setModels([])
        setProviders([])
        setConfiguredProviders([])
        setStatus("error")
        onSelect(null)
        onDetectionComplete()
      })
    return () => controller.abort()
  }, [onDetectionComplete, onSelect])

  const filtered = useMemo(() => {
    return filterModels(models, {
      provider: providerFilter,
      price: priceFilter,
      query,
    })
  }, [models, priceFilter, providerFilter, query])

  const noModelTitle =
    status === "error"
      ? "Détection impossible"
      : configuredProviders.length
        ? "Aucun modèle détecté"
        : "Aucun modèle disponible"
  const noModelDescription =
    status === "error"
      ? "Lumy n’a pas pu vérifier les modèles. Réessayez dans un instant."
      : configuredProviders.length
        ? "La clé configurée n’a retourné aucun modèle utilisable."
        : "Ajoutez une clé API OpenRouter, Kilo Code, OpenCode ou NVIDIA NIM pour commencer."

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className="h-10 min-w-[210px] justify-between bg-card px-4"
          aria-label="Choisir un modèle"
        >
          <span className="flex min-w-0 items-center gap-2">
            {status === "loading" ? (
              <LoaderCircle className="animate-spin" data-icon="inline-start" />
            ) : selectedModel ? (
              <ModelIcon
                model={selectedModel}
                className="size-5 rounded border-0 bg-transparent p-0"
              />
            ) : (
              <CircleAlert data-icon="inline-start" />
            )}
            <span className="truncate">
              {status === "loading"
                ? "Détection des modèles…"
                : (selectedModel?.name ?? "Aucun modèle détecté")}
            </span>
          </span>
          <ChevronDown data-icon="inline-end" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={12}
        className="w-[min(480px,calc(100vw-24px))] p-0"
      >
        {status === "loading" ? (
          <div className="flex min-h-48 flex-col items-center justify-center gap-3 px-6 text-center">
            <LoaderCircle className="size-5 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Vérification des modèles disponibles…
            </p>
          </div>
        ) : models.length === 0 ? (
          <div className="flex min-h-52 flex-col items-center justify-center px-8 text-center">
            <div className="mb-4 grid size-10 place-items-center rounded-lg bg-muted">
              <CircleAlert className="size-5 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium">{noModelTitle}</p>
            <p className="mt-2 max-w-xs text-xs leading-5 text-muted-foreground">
              {noModelDescription}
            </p>
          </div>
        ) : (
          <>
            <div className="space-y-3 bg-muted/30 p-4">
              <div className="relative min-w-0 flex-1">
                <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Rechercher un modèle…"
                  className="pl-9"
                  autoFocus
                />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Select
                  value={providerFilter}
                  onValueChange={(value) =>
                    setProviderFilter(value as ProviderFilter)
                  }
                >
                  <SelectTrigger
                    className="min-w-48 flex-1"
                    aria-label="Filtrer par fournisseur"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent align="start">
                    <SelectItem value="all">Tous les fournisseurs</SelectItem>
                    {providers.map((provider) => (
                      <SelectItem key={provider} value={provider}>
                        {providerLabels[provider]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <ToggleGroup
                  type="single"
                  variant="outline"
                  value={priceFilter}
                  onValueChange={(value) =>
                    value && setPriceFilter(value as PriceFilter)
                  }
                  aria-label="Filtrer par tarif"
                >
                  <ToggleGroupItem value="all">Tous</ToggleGroupItem>
                  <ToggleGroupItem value="free">Gratuits</ToggleGroupItem>
                </ToggleGroup>
              </div>
            </div>

            <ScrollArea className="h-[360px]">
              {filtered.length ? (
                <div className="p-2">
                  {filtered.map((model) => {
                    const selected =
                      model.id === selectedModel?.id &&
                      model.provider === selectedModel.provider
                    return (
                      <button
                        key={`${model.provider}:${model.id}`}
                        type="button"
                        onClick={() => {
                          onSelect(model)
                          setOpen(false)
                        }}
                        className={cn(
                          "flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring",
                          selected && "bg-accent"
                        )}
                      >
                        <ModelIcon model={model} />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2">
                            <span className="truncate text-sm font-medium">
                              {model.name}
                            </span>
                            {model.isFree ? (
                              <Badge variant="secondary">Gratuit</Badge>
                            ) : null}
                            {model.recommended ? (
                              <Badge variant="outline">Recommandé</Badge>
                            ) : null}
                          </span>
                          <span className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-muted-foreground">
                            <span className="shrink-0">
                              {model.providerLabel}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span className="truncate">
                              {model.provider === "lumy"
                                ? "Choix intelligent avec basculement automatique"
                                : model.owner}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span className="shrink-0">
                              {formatTokenCount(model.contextWindow)} de
                              contexte
                            </span>
                          </span>
                        </span>
                        {selected ? (
                          <Check className="size-4 shrink-0 text-primary" />
                        ) : null}
                      </button>
                    )
                  })}
                </div>
              ) : (
                <div className="grid h-full place-items-center px-6 text-center text-sm text-muted-foreground">
                  Aucun modèle ne correspond à cette recherche.
                </div>
              )}
            </ScrollArea>
            <div className="bg-muted/30 px-4 py-3 text-xs text-muted-foreground">
              {filtered.length} sur {models.length} modèle
              {models.length > 1 ? "s" : ""} texte
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  )
}
