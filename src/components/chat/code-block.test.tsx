// @vitest-environment jsdom

import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { CodeBlock } from "@/components/chat/code-block"
import { TooltipProvider } from "@/components/ui/tooltip"

describe("CodeBlock", () => {
  it("renders editor-style lines with copy and download actions", () => {
    render(
      <TooltipProvider>
        <CodeBlock
          code={'<!doctype html>\n<html lang="fr">\n</html>'}
          filename="index.html"
          language="html"
          streaming
        />
      </TooltipProvider>
    )

    expect(screen.getByText("index.html")).toBeTruthy()
    expect(screen.getByText("1")).toBeTruthy()
    expect(screen.getByText("2")).toBeTruthy()
    expect(screen.getByText("3")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Copier le code" })).toBeTruthy()
    expect(
      screen.getByRole("button", { name: "Télécharger index.html" })
    ).toBeTruthy()
  })
})
