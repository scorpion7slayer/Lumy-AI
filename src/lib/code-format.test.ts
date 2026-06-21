import { describe, expect, it } from "vitest"
import { formatCode, parseFenceInfo, safeCodeFilename } from "@/lib/code-format"

describe("code formatting", () => {
  it("extracts and sanitizes a fenced-code filename", () => {
    expect(parseFenceInfo("html filename=../page:demo.html")).toEqual({
      language: "html",
      filename: "page-demo.html",
    })
  })

  it("creates a useful download filename when none is provided", () => {
    expect(safeCodeFilename("typescript")).toBe("code-lumy.ts")
  })

  it("formats supported code with Prettier", async () => {
    await expect(
      formatCode("const value={answer:42}", "javascript")
    ).resolves.toBe("const value = { answer: 42 };")
  })
})
