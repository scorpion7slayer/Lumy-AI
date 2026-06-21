// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import type { ChatModel } from "@/lib/chat-types"
import { ModelIcon, modelBrandIcon } from "@/components/chat/model-icon"

const model: ChatModel = {
  id: "anthropic/claude-sonnet-4",
  name: "Claude Sonnet 4",
  provider: "openrouter",
  providerLabel: "OpenRouter",
  owner: "Anthropic",
  contextWindow: 200_000,
  inputPrice: 3,
  outputPrice: 15,
  speed: 3,
  isFree: false,
  reasoningLevels: ["low", "medium", "high"],
}

afterEach(cleanup)

describe("ModelIcon", () => {
  it("selects the real brand from the model identity", () => {
    expect(modelBrandIcon(model)).not.toBeNull()
    render(<ModelIcon model={model} />)
    expect(screen.queryByTestId("model-brand-icon")).not.toBeNull()
  })

  it("uses a restrained initial when the brand is unknown", () => {
    const { container } = render(
      <ModelIcon
        model={{
          ...model,
          id: "unknown/model",
          name: "Unlisted model",
          owner: "Vendor",
        }}
      />
    )
    expect(screen.queryByTestId("model-brand-icon")).toBeNull()
    expect(container.textContent).toBe("V")
  })

  it("uses the OpenCode icon when the model family has no dedicated icon", () => {
    render(
      <ModelIcon
        model={{
          ...model,
          id: "big-pickle",
          name: "Big Pickle",
          provider: "opencode",
          providerLabel: "OpenCode",
          owner: "OpenCode",
        }}
      />
    )
    expect(screen.queryByTestId("model-brand-icon")).not.toBeNull()
  })
})
