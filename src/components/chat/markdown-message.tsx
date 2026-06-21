import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { CodeBlock } from "@/components/chat/code-block"
import { parseFenceInfo } from "@/lib/code-format"

function codeFenceInfo(content: string) {
  return Array.from(content.matchAll(/^(?:```|~~~)([^\n`]*)\n/gm), (match) =>
    parseFenceInfo(match[1])
  )
}

export function MarkdownMessage({
  content,
  streaming,
}: {
  content: string
  streaming?: boolean
}) {
  const fences = codeFenceInfo(content)
  let fenceIndex = 0

  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        a({ children, href }) {
          return (
            <a
              href={href}
              target="_blank"
              rel="noreferrer noopener"
              className="font-medium text-primary underline decoration-primary/35 underline-offset-3 hover:decoration-primary"
            >
              {children}
            </a>
          )
        },
        blockquote({ children }) {
          return (
            <blockquote className="my-4 border-l-2 border-primary/45 pl-4 text-muted-foreground">
              {children}
            </blockquote>
          )
        },
        code({ children, className }) {
          const rawCode = String(children).replace(/\n$/, "")
          const languageMatch = /language-([^\s]+)/.exec(className ?? "")
          const isBlock = Boolean(
            languageMatch || String(children).endsWith("\n")
          )
          if (isBlock) {
            const info = fences[fenceIndex++] ?? {
              language: languageMatch?.[1] ?? "text",
              filename: undefined,
            }
            return (
              <CodeBlock
                code={rawCode}
                language={info.language || languageMatch?.[1] || "text"}
                filename={info.filename}
                streaming={streaming}
              />
            )
          }
          return (
            <code className="rounded bg-muted [box-decoration-break:clone] px-1.5 py-0.5 font-mono text-[0.84em] break-words">
              {children}
            </code>
          )
        },
        h1({ children }) {
          return <h2 className="text-2xl">{children}</h2>
        },
        hr() {
          return <hr className="my-6 border-border" />
        },
        li({ children }) {
          return <li className="my-1 min-w-0 pl-1 break-words">{children}</li>
        },
        ol({ children }) {
          return (
            <ol className="my-3 list-decimal space-y-1 pl-6">{children}</ol>
          )
        },
        p({ children }) {
          return <p className="my-3 min-w-0 break-words">{children}</p>
        },
        pre({ children }) {
          return <>{children}</>
        },
        table({ children }) {
          return (
            <div
              className="my-5 max-w-full overflow-x-auto rounded-xl border border-border"
              role="region"
              aria-label="Tableau"
              tabIndex={0}
            >
              <table className="w-full min-w-[560px] border-collapse text-left font-sans text-sm">
                {children}
              </table>
            </div>
          )
        },
        td({ children }) {
          return (
            <td className="border-t border-border px-4 py-3 align-top leading-6 break-words">
              {children}
            </td>
          )
        },
        th({ children }) {
          return (
            <th className="bg-muted/60 px-4 py-3 align-bottom text-xs font-semibold tracking-wide text-foreground uppercase">
              {children}
            </th>
          )
        },
        tr({ children }) {
          return <tr className="even:bg-muted/20">{children}</tr>
        },
        ul({ children }) {
          return <ul className="my-3 list-disc space-y-1 pl-6">{children}</ul>
        },
      }}
    >
      {content}
    </ReactMarkdown>
  )
}
