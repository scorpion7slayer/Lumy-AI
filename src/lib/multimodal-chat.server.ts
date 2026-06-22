export type ChatImageInput = {
  name: string
  type: string
  content: Buffer
}

type TextContent = { type: "text"; text: string }
type ImageContent = {
  type: "image_url"
  image_url: { url: string }
}

export type UpstreamChatMessage = {
  role: "user" | "assistant"
  content: string | Array<TextContent | ImageContent>
}

export function attachImagesToLatestUserMessage(
  messages: Array<{ role: "user" | "assistant"; content: string }>,
  images: ChatImageInput[]
): UpstreamChatMessage[] {
  if (!images.length) return messages
  let latestUserIndex = -1
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index].role === "user") {
      latestUserIndex = index
      break
    }
  }
  if (latestUserIndex < 0) return messages

  return messages.map((message, index) => {
    if (index !== latestUserIndex) return message
    const names = images.map((image) => image.name).join(", ")
    return {
      ...message,
      content: [
        {
          type: "text" as const,
          text: `${message.content}\n\nImages jointes : ${names}`.trim(),
        },
        ...images.map((image) => ({
          type: "image_url" as const,
          image_url: {
            url: `data:${image.type};base64,${image.content.toString("base64")}`,
          },
        })),
      ],
    }
  })
}
