export const CHAT_FILE_ACCEPT = [
  ".txt",
  ".md",
  ".csv",
  ".json",
  ".xml",
  ".pdf",
  ".sk",
  ".yml",
  ".yaml",
  "text/*",
  "application/json",
  "application/xml",
  "application/pdf",
  "application/yaml",
  "application/x-yaml",
  "text/yaml",
  "text/x-yaml",
  "image/*",
  ".avif",
  ".heic",
  ".heif",
].join(",")

const APPLICATION_OCTET_STREAM = "application/octet-stream"

const SUPPORTED_DOCUMENT_MIME_TYPES = new Set([
  "application/json",
  "application/pdf",
  "application/xml",
  "application/yaml",
  "application/x-yaml",
  "text/csv",
  "text/markdown",
  "text/plain",
  "text/xml",
  "text/yaml",
  "text/x-yaml",
])

const CHAT_CONTEXT_DOCUMENT_MIME_TYPES = new Set([
  "application/json",
  "application/xml",
  "application/yaml",
  "application/x-yaml",
])

const MIME_TYPE_BY_EXTENSION = new Map([
  [".csv", "text/csv"],
  [".json", "application/json"],
  [".md", "text/markdown"],
  [".pdf", "application/pdf"],
  [".sk", "text/plain"],
  [".txt", "text/plain"],
  [".xml", "application/xml"],
  [".yaml", "application/yaml"],
  [".yml", "application/yaml"],
])

const CHAT_CONTEXT_EXTENSIONS = new Set([
  ".csv",
  ".json",
  ".md",
  ".sk",
  ".txt",
  ".xml",
  ".yaml",
  ".yml",
])

function normalizeMimeType(type: string) {
  return type.split(";").at(0)?.trim().toLocaleLowerCase("en") ?? ""
}

export function fileExtension(name: string) {
  const basename = name.trim().split(/[\\/]/).pop() ?? ""
  const dotIndex = basename.lastIndexOf(".")
  return dotIndex > 0 ? basename.slice(dotIndex).toLocaleLowerCase("en") : ""
}

export function normalizeUploadMimeType(file: Pick<File, "name" | "type">) {
  const declaredType = normalizeMimeType(file.type)
  const extensionType = MIME_TYPE_BY_EXTENSION.get(fileExtension(file.name))

  if (!declaredType || declaredType === APPLICATION_OCTET_STREAM) {
    return extensionType ?? APPLICATION_OCTET_STREAM
  }

  return declaredType
}

export function isSupportedUploadFile(file: Pick<File, "name" | "type">) {
  const type = normalizeUploadMimeType(file)
  return (
    type.startsWith("text/") ||
    SUPPORTED_DOCUMENT_MIME_TYPES.has(type) ||
    MIME_TYPE_BY_EXTENSION.has(fileExtension(file.name))
  )
}

export function isChatDocumentFile(file: Pick<File, "name" | "type">) {
  const type = normalizeUploadMimeType(file)
  return (
    type.startsWith("text/") ||
    CHAT_CONTEXT_DOCUMENT_MIME_TYPES.has(type) ||
    CHAT_CONTEXT_EXTENSIONS.has(fileExtension(file.name))
  )
}
