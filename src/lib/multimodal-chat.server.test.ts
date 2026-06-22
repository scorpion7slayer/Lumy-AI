import { describe, expect, it } from "vitest"
import { attachImagesToLatestUserMessage } from "@/lib/multimodal-chat.server"

describe("multimodal chat messages", () => {
  it("attaches WebP images only to the latest user message", () => {
    const result = attachImagesToLatestUserMessage(
      [
        { role: "user", content: "Premier message" },
        { role: "assistant", content: "Réponse" },
        { role: "user", content: "Que contient cette image ?" },
      ],
      [
        {
          name: "photo.webp",
          type: "image/webp",
          content: Buffer.from([1, 2, 3]),
        },
      ]
    )

    expect(result[0]).toEqual({ role: "user", content: "Premier message" })
    expect(result[2]).toEqual({
      role: "user",
      content: [
        {
          type: "text",
          text: "Que contient cette image ?\n\nImages jointes : photo.webp",
        },
        {
          type: "image_url",
          image_url: { url: "data:image/webp;base64,AQID" },
        },
      ],
    })
  })
})
