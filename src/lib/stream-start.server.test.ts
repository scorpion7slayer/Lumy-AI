import { describe, expect, it } from "vitest"
import {
  bufferUntilModelOutput,
  EmptyModelStreamError,
} from "@/lib/stream-start.server"

const encoder = new TextEncoder()

function streamFrom(chunks: string[]) {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
      controller.close()
    },
  })
}

async function readStream(stream: ReadableStream<Uint8Array>) {
  return new Response(stream).text()
}

describe("stream start detection", () => {
  it("attend le premier contenu réel et rejoue les données déjà reçues", async () => {
    const source = streamFrom([
      ": keepalive\n\n",
      'data: {"choices":[{"delta":{"role":"assistant"}}]}\n\n',
      'data: {"choices":[{"delta":{"reasoning_content":"Je réfléchis"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"Bonjour"}}]}\n\n',
      "data: [DONE]\n\n",
    ])

    const started = await bufferUntilModelOutput(source)
    const output = await readStream(started)
    expect(output).toContain("keepalive")
    expect(output).toContain("Je réfléchis")
    expect(output).toContain("Bonjour")
  })

  it("rejette un flux terminé sans contenu ni réflexion", async () => {
    const source = streamFrom([": keepalive\n\n", "data: [DONE]\n\n"])
    await expect(bufferUntilModelOutput(source)).rejects.toBeInstanceOf(
      EmptyModelStreamError
    )
  })
})
