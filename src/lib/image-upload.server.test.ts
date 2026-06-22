import sharp from "sharp"
import { describe, expect, it } from "vitest"
import {
  convertImageToWebp,
  ImageUploadError,
  looksLikeImageUpload,
} from "@/lib/image-upload.server"

describe("image uploads", () => {
  it("detects browser image MIME types and common image extensions", () => {
    expect(
      looksLikeImageUpload({ name: "photo.bin", type: "image/jpeg" })
    ).toBe(true)
    expect(looksLikeImageUpload({ name: "photo.HEIC", type: "" })).toBe(true)
    expect(
      looksLikeImageUpload({ name: "notes.txt", type: "text/plain" })
    ).toBe(false)
  })

  it("converts a lossless source to WebP and reports the stored payload", async () => {
    const png = await sharp({
      create: {
        width: 32,
        height: 24,
        channels: 4,
        background: { r: 20, g: 120, b: 220, alpha: 0.5 },
      },
    })
      .png()
      .toBuffer()

    const result = await convertImageToWebp(png, "capture.png", 1_000_000)
    const metadata = await sharp(result.content).metadata()
    const [sourcePixels, storedPixels] = await Promise.all([
      sharp(png).raw().toBuffer(),
      sharp(result.content).raw().toBuffer(),
    ])

    expect(result.name).toBe("capture.webp")
    expect(result.type).toBe("image/webp")
    expect(result.size).toBe(result.content.byteLength)
    expect(metadata).toMatchObject({ format: "webp", width: 32, height: 24 })
    expect(metadata.hasAlpha).toBe(true)
    expect(storedPixels.equals(sourcePixels)).toBe(true)
  })

  it("does not introduce an additional pixel loss for photographic sources", async () => {
    const jpeg = await sharp({
      create: {
        width: 24,
        height: 16,
        channels: 3,
        background: { r: 64, g: 128, b: 192 },
      },
    })
      .jpeg({ quality: 76 })
      .toBuffer()

    const result = await convertImageToWebp(jpeg, "photo.jpg", 1_000_000)
    const [decodedSource, storedPixels] = await Promise.all([
      sharp(jpeg).raw().toBuffer(),
      sharp(result.content).raw().toBuffer(),
    ])

    expect(storedPixels.equals(decodedSource)).toBe(true)
  })

  it("rejects invalid image bytes and oversized converted output", async () => {
    await expect(
      convertImageToWebp(Buffer.from("not an image"), "broken.jpg", 1_000)
    ).rejects.toBeInstanceOf(ImageUploadError)

    const png = await sharp({
      create: {
        width: 20,
        height: 20,
        channels: 3,
        background: "red",
      },
    })
      .png()
      .toBuffer()
    await expect(convertImageToWebp(png, "large.png", 1)).rejects.toMatchObject(
      { status: 413 }
    )
  })
})
