type SupportedParser =
  | "babel"
  | "typescript"
  | "html"
  | "css"
  | "scss"
  | "less"
  | "json-stringify"

const parserByLanguage: Partial<Record<string, SupportedParser>> = {
  javascript: "babel",
  js: "babel",
  jsx: "babel",
  typescript: "typescript",
  ts: "typescript",
  tsx: "typescript",
  html: "html",
  htm: "html",
  css: "css",
  scss: "scss",
  less: "less",
  json: "json-stringify",
  jsonc: "json-stringify",
}

export const languageLabels: Record<string, string> = {
  javascript: "JavaScript",
  js: "JavaScript",
  jsx: "JSX",
  typescript: "TypeScript",
  ts: "TypeScript",
  tsx: "TSX",
  html: "HTML",
  htm: "HTML",
  css: "CSS",
  scss: "SCSS",
  less: "Less",
  json: "JSON",
  jsonc: "JSON",
  bash: "Terminal",
  shell: "Terminal",
  sh: "Terminal",
  python: "Python",
  py: "Python",
  php: "PHP",
  sql: "SQL",
  markdown: "Markdown",
  md: "Markdown",
  text: "Texte",
  txt: "Texte",
}

const extensionByLanguage: Record<string, string> = {
  javascript: "js",
  js: "js",
  jsx: "jsx",
  typescript: "ts",
  ts: "ts",
  tsx: "tsx",
  html: "html",
  htm: "html",
  css: "css",
  scss: "scss",
  less: "less",
  json: "json",
  jsonc: "json",
  bash: "sh",
  shell: "sh",
  sh: "sh",
  python: "py",
  py: "py",
  php: "php",
  sql: "sql",
  markdown: "md",
  md: "md",
  text: "txt",
  txt: "txt",
}

export function normalizeLanguage(value: string) {
  return (
    value
      .trim()
      .toLocaleLowerCase("en")
      .replace(/^language-/, "") || "text"
  )
}

export function safeCodeFilename(language: string, filename?: string) {
  const sanitized = filename
    ?.trim()
    .replace(/^filename=/i, "")
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/^[.-]+/, "")
    .slice(0, 120)
  if (sanitized) return sanitized
  const extension = extensionByLanguage[normalizeLanguage(language)] ?? "txt"
  return `code-lumy.${extension}`
}

export function parseFenceInfo(value: string) {
  const parts = value.trim().split(/\s+/).filter(Boolean)
  const language = normalizeLanguage(parts.shift() ?? "text")
  const explicitFilename = parts.find((part) => /^filename=/i.test(part))
  const looseFilename = parts.find((part) => /\.[a-z0-9]{1,8}$/i.test(part))
  return {
    language,
    filename: safeCodeFilename(
      language,
      explicitFilename?.replace(/^filename=/i, "") ?? looseFilename
    ),
  }
}

export async function formatCode(code: string, language: string) {
  const parser = parserByLanguage[normalizeLanguage(language)]
  const normalizedCode = code.replace(/^\n/, "").trimEnd()
  if (!parser || !normalizedCode) return normalizedCode

  try {
    const [{ format }, estree] = await Promise.all([
      import("prettier/standalone"),
      import("prettier/plugins/estree"),
    ])
    const plugins: object[] = [estree]

    if (parser === "babel" || parser === "json-stringify") {
      plugins.push(await import("prettier/plugins/babel"))
    } else if (parser === "typescript") {
      plugins.push(await import("prettier/plugins/typescript"))
    } else if (parser === "html") {
      const [html, babel, postcss] = await Promise.all([
        import("prettier/plugins/html"),
        import("prettier/plugins/babel"),
        import("prettier/plugins/postcss"),
      ])
      plugins.push(html, babel, postcss)
    } else {
      plugins.push(await import("prettier/plugins/postcss"))
    }

    return (
      await format(normalizedCode, {
        parser,
        plugins,
        printWidth: 88,
        tabWidth: 2,
        useTabs: false,
      })
    ).trimEnd()
  } catch {
    return normalizedCode
  }
}
