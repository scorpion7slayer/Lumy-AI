import path from "node:path"
import sharp from "sharp"

const MAX_IMAGE_PIXELS = 80_000_000
const MAX_IMAGE_EDGE = 16_384
const MAX_ANIMATION_FRAMES = 100

const IMAGE_EXTENSIONS = new Set([
  ".avif",
  ".gif",
  ".heic",
  ".heif",
  ".jpeg",
  ".jpg",
  ".png",
  ".svg",
  ".tif",
  ".tiff",
  ".webp",
])

export class ImageUploadError extends Error {
  constructor(
    message: string,
    readonly status: 413 | 415 = 415
  ) {
    super(message)
    this.name = "ImageUploadError"
  }
}

export type ProcessedImage = {
  content: Buffer
  name: string
  size: number
  type: "image/webp"
}

export function looksLikeImageUpload(file: Pick<File, "name" | "type">) {
  return (
    file.type.toLocaleLowerCase("en").startsWith("image/") ||
    IMAGE_EXTENSIONS.has(path.extname(file.name).toLocaleLowerCase("en"))
  )
}

function webpName(name: string) {
  const extension = path.extname(name)
  const basename = extension ? name.slice(0, -extension.length) : name
  return `${basename || "image"}.webp`.slice(0, 255)
}

export async function convertImageToWebp(
  input: Buffer,
  originalName: string,
  maximumOutputBytes: number
): Promise<ProcessedImage> {
  try {
    const image = sharp(input, {
      animated: true,
      failOn: "error",
      limitInputPixels: MAX_IMAGE_PIXELS,
      sequentialRead: true,
    })
    const metadata = await image.metadata()
    const width = metadata.width
    const height = metadata.height
    const frames = metadata.pages ?? 1

    if (
      !width ||
      !height ||
      width > MAX_IMAGE_EDGE ||
      height > MAX_IMAGE_EDGE
    ) {
      throw new ImageUploadError(
        `L’image ${originalName} dépasse les dimensions autorisées.`,
        413
      )
    }
    if (frames > MAX_ANIMATION_FRAMES) {
      throw new ImageUploadError(
        `L’image ${originalName} contient trop d’images d’animation.`,
        413
      )
    }

    const content = await image
      .autoOrient()
      .webp({ lossless: true, exact: true, effort: 6 })
      .toBuffer()

    if (content.byteLength > maximumOutputBytes) {
      throw new ImageUploadError(
        `L’image ${originalName} reste trop volumineuse après compression.`,
        413
      )
    }

    return {
      content,
      name: webpName(originalName),
      size: content.byteLength,
      type: "image/webp",
    }
  } catch (error) {
    if (error instanceof ImageUploadError) throw error
    throw new ImageUploadError(
      `L’image ${originalName} est invalide ou utilise un format non pris en charge.`
    )
  }
}
