import { describe, expect, it } from "vitest"
import {
  CHAT_FILE_ACCEPT,
  fileExtension,
  isArchiveFile,
  isChatDocumentFile,
  isSupportedUploadFile,
  normalizeUploadMimeType,
  shouldForceFileDownload,
} from "@/lib/file-support"

describe("file support", () => {
  it("exposes Skript and YAML extensions to browser file pickers", () => {
    expect(CHAT_FILE_ACCEPT).toContain(".sk")
    expect(CHAT_FILE_ACCEPT).toContain(".yml")
    expect(CHAT_FILE_ACCEPT).toContain(".yaml")
  })

  it("accepts Skript and YAML files even without reliable browser MIME types", () => {
    expect(isSupportedUploadFile({ name: "plugins/test.sk", type: "" })).toBe(
      true
    )
    expect(
      isSupportedUploadFile({
        name: "config.yml",
        type: "application/octet-stream",
      })
    ).toBe(true)
    expect(
      isSupportedUploadFile({ name: "values.yaml", type: "application/x-yaml" })
    ).toBe(true)
  })

  it("normalizes supported extension MIME types for storage and chat context", () => {
    expect(normalizeUploadMimeType({ name: "test.sk", type: "" })).toBe(
      "text/plain"
    )
    expect(
      normalizeUploadMimeType({
        name: "config.yaml",
        type: "application/octet-stream",
      })
    ).toBe("application/yaml")
    expect(
      isChatDocumentFile({
        name: "legacy.sk",
        type: "application/octet-stream",
      })
    ).toBe(true)
  })

  it("does not accept unknown binary files as documents", () => {
    expect(fileExtension("archive.tar.gz")).toBe(".gz")
    expect(
      isSupportedUploadFile({
        name: "program.exe",
        type: "application/octet-stream",
      })
    ).toBe(false)
    expect(
      isSupportedUploadFile({ name: "program.exe", type: "text/plain" })
    ).toBe(false)
    expect(
      isChatDocumentFile({ name: "program.exe", type: "text/plain" })
    ).toBe(false)
  })

  it("accepts common source code and configuration files as chat context", () => {
    for (const name of [
      "app.tsx",
      "server.py",
      "schema.sql",
      "Cargo.toml",
      "Dockerfile",
      ".gitignore",
      "events.jsonl",
    ]) {
      expect(isSupportedUploadFile({ name, type: "" }), name).toBe(true)
      expect(isChatDocumentFile({ name, type: "" }), name).toBe(true)
    }
  })

  it("stores office documents without treating their binary contents as chat text", () => {
    for (const name of [
      "brief.pdf",
      "legacy.doc",
      "brief.docx",
      "legacy.xls",
      "budget.xlsx",
      "legacy.ppt",
      "slides.pptx",
      "notes.odt",
    ]) {
      expect(isSupportedUploadFile({ name, type: "" }), name).toBe(true)
      expect(isChatDocumentFile({ name, type: "text/plain" }), name).toBe(false)
    }
  })

  it("stores archives but never exposes them as chat context", () => {
    const archives = [
      ["bundle.zip", "application/zip"],
      ["plugin.jar", "application/java-archive"],
      ["source.tar", "application/x-tar"],
      ["source.tar.gz", "application/gzip"],
      ["source.tgz", "application/gzip"],
      ["source.7z", "application/x-7z-compressed"],
      ["source.rar", "application/vnd.rar"],
    ] as const

    for (const [name, type] of archives) {
      const file = { name, type }
      expect(isSupportedUploadFile(file), name).toBe(true)
      expect(isArchiveFile(file), name).toBe(true)
      expect(isChatDocumentFile(file), name).toBe(false)
      expect(shouldForceFileDownload(file), name).toBe(true)
    }
  })

  it("canonicalizes known extensions so spoofed MIME types cannot change handling", () => {
    expect(
      normalizeUploadMimeType({ name: "plugin.jar", type: "text/plain" })
    ).toBe("application/java-archive")
    expect(isChatDocumentFile({ name: "plugin.jar", type: "text/plain" })).toBe(
      false
    )
  })

  it("forces active HTML and SVG content to download", () => {
    expect(
      shouldForceFileDownload({ name: "page.html", type: "text/html" })
    ).toBe(true)
    expect(
      shouldForceFileDownload({ name: "icon.svg", type: "image/svg+xml" })
    ).toBe(true)
  })
})
