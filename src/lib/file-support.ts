const APPLICATION_OCTET_STREAM = "application/octet-stream"

const PLAIN_TEXT_EXTENSIONS = [
  ".bash",
  ".bat",
  ".c",
  ".cc",
  ".clj",
  ".cljs",
  ".cmake",
  ".cmd",
  ".coffee",
  ".conf",
  ".cpp",
  ".cs",
  ".cxx",
  ".dart",
  ".diff",
  ".erl",
  ".ex",
  ".exs",
  ".env",
  ".fish",
  ".fs",
  ".fsx",
  ".go",
  ".gradle",
  ".graphql",
  ".gql",
  ".h",
  ".hpp",
  ".hxx",
  ".hs",
  ".hrl",
  ".ini",
  ".java",
  ".js",
  ".jsx",
  ".jl",
  ".kt",
  ".kts",
  ".less",
  ".log",
  ".lock",
  ".lua",
  ".m",
  ".mm",
  ".mjs",
  ".mts",
  ".patch",
  ".php",
  ".pl",
  ".properties",
  ".proto",
  ".ps1",
  ".py",
  ".r",
  ".rb",
  ".rs",
  ".sass",
  ".scala",
  ".scss",
  ".sh",
  ".sk",
  ".sql",
  ".sol",
  ".svelte",
  ".swift",
  ".tex",
  ".tf",
  ".tfvars",
  ".toml",
  ".ts",
  ".tsx",
  ".vue",
  ".vb",
  ".vbs",
  ".zsh",
] as const

const CHAT_CONTEXT_MIME_BY_EXTENSION = new Map<string, string>([
  ...PLAIN_TEXT_EXTENSIONS.map(
    (extension) => [extension, "text/plain"] as const
  ),
  [".css", "text/css"],
  [".csv", "text/csv"],
  [".htm", "text/html"],
  [".html", "text/html"],
  [".ipynb", "application/json"],
  [".json", "application/json"],
  [".jsonl", "application/x-ndjson"],
  [".md", "text/markdown"],
  [".txt", "text/plain"],
  [".xml", "application/xml"],
  [".yaml", "application/yaml"],
  [".yml", "application/yaml"],
])

const STORED_DOCUMENT_MIME_BY_EXTENSION = new Map<string, string>([
  [".doc", "application/msword"],
  [
    ".docx",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ],
  [".ods", "application/vnd.oasis.opendocument.spreadsheet"],
  [".odt", "application/vnd.oasis.opendocument.text"],
  [".odp", "application/vnd.oasis.opendocument.presentation"],
  [".pdf", "application/pdf"],
  [".ppt", "application/vnd.ms-powerpoint"],
  [
    ".pptx",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ],
  [".rtf", "application/rtf"],
  [".xls", "application/vnd.ms-excel"],
  [
    ".xlsx",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ],
])

const ARCHIVE_MIME_BY_EXTENSION = new Map<string, string>([
  [".7z", "application/x-7z-compressed"],
  [".gz", "application/gzip"],
  [".jar", "application/java-archive"],
  [".rar", "application/vnd.rar"],
  [".tar", "application/x-tar"],
  [".tgz", "application/gzip"],
  [".zip", "application/zip"],
])

const MIME_TYPE_BY_EXTENSION = new Map<string, string>([
  ...CHAT_CONTEXT_MIME_BY_EXTENSION,
  ...STORED_DOCUMENT_MIME_BY_EXTENSION,
  ...ARCHIVE_MIME_BY_EXTENSION,
])

const CHAT_CONTEXT_FILENAMES = new Set([
  "dockerfile",
  "license",
  "makefile",
  "procfile",
  "readme",
  ".dockerignore",
  ".editorconfig",
  ".env",
  ".gitattributes",
  ".gitignore",
  ".npmrc",
  ".nvmrc",
])

const FORCED_ATTACHMENT_EXTENSIONS = new Set([
  ...ARCHIVE_MIME_BY_EXTENSION.keys(),
  ".htm",
  ".html",
  ".svg",
])

const ARCHIVE_MIME_TYPES = new Set([
  ...ARCHIVE_MIME_BY_EXTENSION.values(),
  "application/x-java-archive",
  "application/x-rar-compressed",
])

const FORCED_ATTACHMENT_MIME_TYPES = new Set([
  ...ARCHIVE_MIME_TYPES,
  "application/xhtml+xml",
  "image/svg+xml",
  "text/html",
])

export const CHAT_FILE_ACCEPT = [
  ...MIME_TYPE_BY_EXTENSION.keys(),
  "image/*",
  ".avif",
  ".heic",
  ".heif",
].join(",")

function normalizeMimeType(type: string) {
  return type.split(";").at(0)?.trim().toLocaleLowerCase("en") ?? ""
}

function basename(name: string) {
  return (name.trim().split(/[\\/]/).pop() ?? "").toLocaleLowerCase("en")
}

export function fileExtension(name: string) {
  const nameBasename = basename(name)
  const dotIndex = nameBasename.lastIndexOf(".")
  return dotIndex > 0 ? nameBasename.slice(dotIndex) : ""
}

export function normalizeUploadMimeType(file: Pick<File, "name" | "type">) {
  const extensionType = MIME_TYPE_BY_EXTENSION.get(fileExtension(file.name))
  if (extensionType) return extensionType

  const declaredType = normalizeMimeType(file.type)
  if (!declaredType || declaredType === APPLICATION_OCTET_STREAM) {
    return CHAT_CONTEXT_FILENAMES.has(basename(file.name))
      ? "text/plain"
      : APPLICATION_OCTET_STREAM
  }

  return declaredType
}

export function isSupportedUploadFile(file: Pick<File, "name" | "type">) {
  return (
    MIME_TYPE_BY_EXTENSION.has(fileExtension(file.name)) ||
    CHAT_CONTEXT_FILENAMES.has(basename(file.name))
  )
}

export function isChatDocumentFile(file: Pick<File, "name" | "type">) {
  return (
    CHAT_CONTEXT_MIME_BY_EXTENSION.has(fileExtension(file.name)) ||
    CHAT_CONTEXT_FILENAMES.has(basename(file.name))
  )
}

export function isArchiveFile(file: Pick<File, "name" | "type">) {
  return (
    ARCHIVE_MIME_BY_EXTENSION.has(fileExtension(file.name)) ||
    ARCHIVE_MIME_TYPES.has(normalizeMimeType(file.type))
  )
}

export function shouldForceFileDownload(file: Pick<File, "name" | "type">) {
  return (
    FORCED_ATTACHMENT_EXTENSIONS.has(fileExtension(file.name)) ||
    FORCED_ATTACHMENT_MIME_TYPES.has(normalizeMimeType(file.type))
  )
}
