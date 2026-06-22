import { describe, expect, it } from "vitest"
import {
  CHAT_FILE_ACCEPT,
  fileExtension,
  isChatDocumentFile,
  isSupportedUploadFile,
  normalizeUploadMimeType,
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
  })
})
