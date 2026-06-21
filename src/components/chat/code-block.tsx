import { useEffect, useMemo, useState } from "react"
import { Check, Copy, Download, LoaderCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  formatCode,
  languageLabels,
  normalizeLanguage,
  safeCodeFilename,
} from "@/lib/code-format"

const keywords = new Set(
  [
    "as",
    "async",
    "await",
    "break",
    "case",
    "catch",
    "class",
    "const",
    "continue",
    "def",
    "do",
    "else",
    "export",
    "extends",
    "false",
    "finally",
    "for",
    "from",
    "function",
    "if",
    "implements",
    "import",
    "in",
    "interface",
    "let",
    "new",
    "null",
    "private",
    "protected",
    "public",
    "return",
    "static",
    "switch",
    "throw",
    "true",
    "try",
    "type",
    "undefined",
    "var",
    "while",
    "yield",
  ].map((keyword) => keyword.toLocaleLowerCase("en"))
)

const tokenPattern =
  /(<!--[\s\S]*?-->|\/\*[\s\S]*?\*\/|\/\/.*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|<\/?[A-Za-z][\w:-]*|\b\d+(?:\.\d+)?\b|\b[A-Za-z_$][\w$]*\b|[{}[\]();,.=:<>/+*-])/g

function tokenClass(token: string, language: string) {
  const normalized = token.toLocaleLowerCase("en")
  if (
    token.startsWith("//") ||
    token.startsWith("/*") ||
    token.startsWith("<!--") ||
    ((language === "python" || language === "py" || language === "bash") &&
      token.startsWith("#"))
  )
    return "code-token-comment"
  if (/^["'`]/.test(token)) return "code-token-string"
  if (/^<\/?[A-Za-z]/.test(token)) return "code-token-tag"
  if (/^\d/.test(token)) return "code-token-number"
  if (keywords.has(normalized)) return "code-token-keyword"
  if (/^[{}[\]();,.=:<>/+*-]$/.test(token)) return "code-token-punctuation"
  return undefined
}

function HighlightedLine({
  line,
  language,
}: {
  line: string
  language: string
}) {
  const nodes: React.ReactNode[] = []
  let cursor = 0
  for (const match of line.matchAll(tokenPattern)) {
    const index = match.index
    if (index > cursor) nodes.push(line.slice(cursor, index))
    const token = match[0]
    const className = tokenClass(token, language)
    nodes.push(
      className ? (
        <span className={className} key={`${index}-${token}`}>
          {token}
        </span>
      ) : (
        token
      )
    )
    cursor = index + token.length
  }
  if (cursor < line.length) nodes.push(line.slice(cursor))
  return <>{nodes.length ? nodes : " "}</>
}

export function CodeBlock({
  code,
  language,
  filename,
  streaming = false,
}: {
  code: string
  language: string
  filename?: string
  streaming?: boolean
}) {
  const normalizedLanguage = normalizeLanguage(language)
  const downloadName = safeCodeFilename(normalizedLanguage, filename)
  const [formattedCode, setFormattedCode] = useState(code.trimEnd())
  const [formatting, setFormatting] = useState(!streaming)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let cancelled = false
    const rawCode = code.trimEnd()
    setFormattedCode(rawCode)
    if (streaming) {
      setFormatting(false)
      return () => {
        cancelled = true
      }
    }
    setFormatting(true)
    void formatCode(rawCode, normalizedLanguage).then((result) => {
      if (cancelled) return
      setFormattedCode(result)
      setFormatting(false)
    })
    return () => {
      cancelled = true
    }
  }, [code, normalizedLanguage, streaming])

  const lines = useMemo(() => formattedCode.split("\n"), [formattedCode])

  const copy = async () => {
    await navigator.clipboard.writeText(formattedCode)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1_400)
  }

  const download = () => {
    const blob = new Blob([formattedCode], {
      type: "text/plain;charset=utf-8",
    })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement("a")
    anchor.href = url
    anchor.download = downloadName
    anchor.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 0)
  }

  return (
    <section className="code-editor my-5 overflow-hidden rounded-xl border border-[var(--code-border)] bg-[var(--code-background)] text-[var(--code-foreground)] shadow-sm">
      <header className="flex min-h-11 items-center gap-3 border-b border-[var(--code-border)] bg-[var(--code-header)] px-3">
        <div className="flex gap-1.5" aria-hidden="true">
          <span className="size-2.5 rounded-full bg-[#dd6b63]" />
          <span className="size-2.5 rounded-full bg-[#d9aa57]" />
          <span className="size-2.5 rounded-full bg-[#70a56b]" />
        </div>
        <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-[var(--code-muted)]">
          {filename ?? languageLabels[normalizedLanguage]}
        </span>
        {formatting ? (
          <span className="flex items-center gap-1.5 text-[10px] text-[var(--code-muted)]">
            <LoaderCircle className="size-3 animate-spin" />
            Formatage
          </span>
        ) : null}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              className="text-[var(--code-muted)] hover:bg-[var(--code-hover)] hover:text-[var(--code-foreground)]"
              onClick={copy}
              aria-label="Copier le code"
            >
              {copied ? <Check /> : <Copy />}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{copied ? "Copié" : "Copier le code"}</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              className="text-[var(--code-muted)] hover:bg-[var(--code-hover)] hover:text-[var(--code-foreground)]"
              onClick={download}
              aria-label={`Télécharger ${downloadName}`}
            >
              <Download />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Télécharger {downloadName}</TooltipContent>
        </Tooltip>
      </header>
      <div className="max-h-[34rem] overflow-auto py-3 font-mono text-[13px] leading-6 [tab-size:2]">
        {lines.map((line, index) => (
          <div
            className="grid min-w-max grid-cols-[3.25rem_minmax(0,1fr)] px-3 hover:bg-[var(--code-hover)]"
            key={index}
          >
            <span
              className="sticky left-0 border-r border-[var(--code-border)] bg-[var(--code-background)] pr-3 text-right text-[var(--code-line)] select-none"
              aria-hidden="true"
            >
              {index + 1}
            </span>
            <code className="block pl-4 whitespace-pre">
              <HighlightedLine line={line} language={normalizedLanguage} />
            </code>
          </div>
        ))}
      </div>
    </section>
  )
}
