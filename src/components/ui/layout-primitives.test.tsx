// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"

afterEach(cleanup)

describe("primitives de mise en page", () => {
  it("laisse une largeur personnalisée remplacer la largeur du dialogue par défaut", () => {
    render(
      <Dialog open>
        <DialogContent className="max-w-6xl">
          <DialogTitle>Dialogue large</DialogTitle>
        </DialogContent>
      </Dialog>
    )

    const content = document.querySelector('[data-slot="dialog-content"]')

    expect(content?.className).toContain("max-w-6xl")
    expect(content?.className).not.toContain("max-w-sm")
    expect(content?.className).not.toContain("sm:max-w-sm")
  })

  it("conserve la zone de défilement dans ses limites arrondies", () => {
    const { container } = render(
      <ScrollArea className="h-24">
        <div className="h-96">Contenu long</div>
      </ScrollArea>
    )

    const root = container.querySelector('[data-slot="scroll-area"]')

    expect(root?.className).toContain("overflow-hidden")
  })
})
