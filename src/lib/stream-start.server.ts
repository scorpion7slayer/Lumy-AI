function hasModelText(value: unknown): boolean {
  if (typeof value === "string") return value.length > 0
  if (Array.isArray(value)) return value.some(hasModelText)
  if (!value || typeof value !== "object") return false

  const detail = value as Record<string, unknown>
  return ["text", "content", "reasoning", "reasoning_content", "summary"].some(
    (key) => hasModelText(detail[key])
  )
}

function isModelOutputLine(line: string) {
  const normalized = line.trim()
  if (!normalized.startsWith("data:")) return false
  const data = normalized.slice(5).trim()
  if (!data || data === "[DONE]") return false

  try {
    const payload = JSON.parse(data) as {
      content?: unknown
      choices?: Array<{ delta?: unknown; message?: unknown }>
    }
    return (
      hasModelText(payload.content) ||
      payload.choices?.some(
        (choice) => hasModelText(choice.delta) || hasModelText(choice.message)
      ) === true
    )
  } catch {
    return false
  }
}

export class EmptyModelStreamError extends Error {
  constructor() {
    super("Le modèle n’a produit aucun token.")
    this.name = "EmptyModelStreamError"
  }
}

export async function bufferUntilModelOutput(body: ReadableStream<Uint8Array>) {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  const bufferedChunks: Uint8Array[] = []
  let bufferedText = ""

  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) throw new EmptyModelStreamError()
      bufferedChunks.push(value)
      bufferedText += decoder.decode(value, { stream: true })
      const lines = bufferedText.split("\n")
      bufferedText = lines.pop() ?? ""
      if (lines.some(isModelOutputLine)) break
    }
  } catch (error) {
    await reader.cancel(error).catch(() => undefined)
    throw error
  }

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      for (const chunk of bufferedChunks) controller.enqueue(chunk)
      try {
        for (;;) {
          const { done, value } = await reader.read()
          if (done) {
            controller.close()
            return
          }
          controller.enqueue(value)
        }
      } catch (error) {
        controller.error(error)
      }
    },
    cancel(reason) {
      return reader.cancel(reason)
    },
  })
}
