import type { ReflectionLevel } from "@/lib/chat-types"

export type ModelCapabilitiesInput = {
  id?: string
  name?: string
  architecture?: {
    modality?: string
    input_modalities?: string[]
    output_modalities?: string[]
  }
  supported_parameters?: string[]
  supports_reasoning?: boolean
  reasoning?: boolean
}

export function reasoningLevelsForModel(
  model: ModelCapabilitiesInput
): ReflectionLevel[] {
  const configurable = model.supported_parameters?.includes("reasoning")
  if (configurable) return ["low", "medium", "high"]
  const fixed =
    model.supports_reasoning === true ||
    model.reasoning === true ||
    /(?:^|[/:.-])(r1|reasoning|thinking|o1|o3|o4)(?:$|[/:.-])/i.test(
      model.id ?? ""
    )
  return fixed ? ["standard"] : []
}

export function producesText(model: ModelCapabilitiesInput) {
  const inputs = model.architecture?.input_modalities?.map((value) =>
    value.toLocaleLowerCase("en")
  )
  if (inputs?.length && !inputs.includes("text")) return false

  const inputFromModality = model.architecture?.modality
    ?.split("->")
    .at(0)
    ?.toLocaleLowerCase("en")
  if (
    inputFromModality &&
    !inputFromModality.split(/[+,/]/).some((input) => input.trim() === "text")
  )
    return false

  const outputs = model.architecture?.output_modalities?.map((value) =>
    value.toLocaleLowerCase("en")
  )
  if (outputs?.length) {
    return (
      outputs.includes("text") && outputs.every((output) => output === "text")
    )
  }

  const outputFromModality = model.architecture?.modality
    ?.split("->")
    .at(-1)
    ?.toLocaleLowerCase("en")
  if (outputFromModality) {
    const modalities = outputFromModality
      .split(/[+,/]/)
      .map((output) => output.trim())
    return (
      modalities.includes("text") &&
      modalities.every((output) => output === "text")
    )
  }

  const identity = `${model.id ?? ""} ${model.name ?? ""}`.toLocaleLowerCase(
    "en"
  )
  return !/(image[- ]generation|text[- ]to[- ]image|tts|text[- ]to[- ]speech|audio[- ]generation|voice[- ]generation|embedding|\bembed|rerank|retrieval|(?:^|[/.-])bge-|detector|content[- ]safety|safety[- ]guard|nemoguard|llama[- ]guard|reward|(?:^|[/_.-])parse(?:$|[/_.-])|\bpii\b|nvclip|\bclip\b|deplot|fuyu|kosmos|neva|(?:^|[/_.-])vila(?:$|[/_.-])|cosmos[- ]reason|dall-e|stable[- ]diffusion|sdxl|flux(?:[/:.-]|$)|imagen|recraft|ideogram|midjourney|sora|veo|whisper|elevenlabs)/.test(
    identity
  )
}
