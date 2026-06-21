import { describe, expect, it } from "vitest"
import { formatTokenCount } from "@/lib/model-format"

describe("model token formatting", () => {
  it("formats context windows compactly", () => {
    expect(formatTokenCount(128_000)).toBe("128 k")
    expect(formatTokenCount(1_000_000)).toBe("1 M")
  })

  it("can display an exact token estimate", () => {
    expect(formatTokenCount(12_345, false)).toBe("12 345")
  })
})
