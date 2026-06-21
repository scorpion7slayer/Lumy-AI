import { describe, expect, it } from "vitest"
import {
  producesTextOnly,
  reasoningLevelsForModel,
} from "@/lib/model-capabilities"

describe("model capabilities", () => {
  it("offers only the reflection levels supported by the model", () => {
    expect(reasoningLevelsForModel({ id: "vendor/chat" })).toEqual([])
    expect(reasoningLevelsForModel({ id: "vendor/r1-distill" })).toEqual([
      "standard",
    ])
    expect(
      reasoningLevelsForModel({
        id: "vendor/reasoner",
        supported_parameters: ["reasoning"],
      })
    ).toEqual(["low", "medium", "high"])
  })

  it("keeps text output and excludes image or audio output", () => {
    expect(
      producesTextOnly({ architecture: { output_modalities: ["text"] } })
    ).toBe(true)
    expect(
      producesTextOnly({
        architecture: { output_modalities: ["text", "image"] },
      })
    ).toBe(false)
    expect(producesTextOnly({ id: "vendor/text-to-speech" })).toBe(false)
    expect(producesTextOnly({ id: "black-forest-labs/flux-1" })).toBe(false)
    expect(producesTextOnly({ id: "openai/whisper-large" })).toBe(false)
    expect(producesTextOnly({ id: "nvidia/nv-embedqa-e5-v5" })).toBe(false)
    expect(producesTextOnly({ id: "nvidia/nv-rerankqa-mistral-4b-v3" })).toBe(
      false
    )
    expect(producesTextOnly({ id: "meta/llama-3.2-90b-vision-instruct" })).toBe(
      false
    )
    expect(
      producesTextOnly({ id: "microsoft/phi-4-multimodal-instruct" })
    ).toBe(false)
    expect(producesTextOnly({ id: "nvidia/nemotron-4-340b-reward" })).toBe(
      false
    )
    expect(producesTextOnly({ id: "nvidia/nemotron-3-content-safety" })).toBe(
      false
    )
  })
})
