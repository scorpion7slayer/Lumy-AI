// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { MarkdownMessage } from "@/components/chat/markdown-message"
import { TooltipProvider } from "@/components/ui/tooltip"

afterEach(cleanup)

describe("MarkdownMessage", () => {
  it("renders GFM tables instead of displaying their pipes", () => {
    render(
      <TooltipProvider>
        <MarkdownMessage
          content={`| Solution | Usage |
| --- | --- |
| **MDN** | Apprendre le Web |`}
        />
      </TooltipProvider>
    )

    expect(screen.queryByRole("table")).not.toBeNull()
    expect(
      screen.queryByRole("columnheader", { name: "Solution" })
    ).not.toBeNull()
    expect(screen.queryByRole("cell", { name: "MDN" })).not.toBeNull()
  })

  it("renders links and inline code with safe wrapping", () => {
    const { container } = render(
      <TooltipProvider>
        <MarkdownMessage content="Consultez [MDN](https://developer.mozilla.org/) puis `index.html`." />
      </TooltipProvider>
    )

    const link = screen.getByRole("link", { name: "MDN" })
    expect(link.getAttribute("target")).toBe("_blank")
    expect(container.querySelector("code")?.className).toContain("break-words")
  })

  it("keeps numbered steps and adjacent code fragments in normal flow", () => {
    const { container } = render(
      <TooltipProvider>
        <MarkdownMessage
          content={`1. **Créer un dépôt GitHub** : \`monsite\` (ou \`username.github.io\`).
2. **Initialiser le dépôt local**.`}
        />
      </TooltipProvider>
    )

    expect(container.querySelectorAll("ol > li")).toHaveLength(2)
    const codeFragments = container.querySelectorAll("li code")
    expect(codeFragments).toHaveLength(2)
    expect(
      Array.from(codeFragments).every(
        (fragment) => getComputedStyle(fragment).position !== "absolute"
      )
    ).toBe(true)
  })
})
