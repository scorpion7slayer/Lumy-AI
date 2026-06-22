import { describe, expect, it } from "vitest"
import { producesText, reasoningLevelsForModel } from "@/lib/model-capabilities"

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

  it("keeps chatbot models with text input and output, including multimodal input", () => {
    expect(
      producesText({ architecture: { output_modalities: ["text"] } })
    ).toBe(true)
    expect(
      producesText({
        architecture: {
          input_modalities: ["text", "image", "audio"],
          output_modalities: ["text"],
        },
      })
    ).toBe(true)
    expect(
      producesText({
        architecture: {
          input_modalities: ["text", "image"],
          output_modalities: ["text", "image"],
        },
      })
    ).toBe(false)
    expect(
      producesText({
        architecture: {
          input_modalities: ["image", "audio"],
          output_modalities: ["text"],
        },
      })
    ).toBe(false)
    expect(
      producesText({ architecture: { modality: "text+audio->text" } })
    ).toBe(true)
    expect(
      producesText({ architecture: { modality: "text+image->text+image" } })
    ).toBe(false)
    expect(producesText({ architecture: { modality: "audio->text" } })).toBe(
      false
    )
    expect(producesText({ id: "vendor/text-to-speech" })).toBe(false)
    expect(producesText({ id: "black-forest-labs/flux-1" })).toBe(false)
    expect(producesText({ id: "openai/whisper-large" })).toBe(false)
    expect(producesText({ id: "nvidia/nv-embedqa-e5-v5" })).toBe(false)
    expect(producesText({ id: "nvidia/nv-rerankqa-mistral-4b-v3" })).toBe(false)
    expect(producesText({ id: "meta/llama-3.2-90b-vision-instruct" })).toBe(
      true
    )
    expect(producesText({ id: "microsoft/phi-4-multimodal-instruct" })).toBe(
      true
    )
    expect(producesText({ id: "google/diffusiongemma-26b-a4b-it" })).toBe(true)
    expect(producesText({ id: "nvidia/ising-calibration-1-35b-a3b" })).toBe(
      true
    )
    expect(producesText({ id: "nvidia/nemotron-nano-12b-v2-vl" })).toBe(true)
    expect(producesText({ id: "nvidia/nemotron-4-340b-reward" })).toBe(false)
    expect(producesText({ id: "nvidia/nemotron-3-content-safety" })).toBe(false)
  })
})
