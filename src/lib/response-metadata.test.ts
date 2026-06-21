import { describe, expect, it } from "vitest"
import { splitResponseMetadata } from "@/lib/response-metadata"

describe("response metadata", () => {
  it("removes memory markers and extracts their identifiers", () => {
    expect(
      splitResponseMetadata(
        "Réponse personnalisée.\n\n[[LUMY_MEMORY:profile,goals]]"
      )
    ).toEqual({
      content: "Réponse personnalisée.\n\n",
      usedMemoryIds: ["profile", "goals"],
    })
  })

  it("hides a partial marker while it is streaming", () => {
    expect(splitResponseMetadata("Réponse.[[LUMY_MEM")).toEqual({
      content: "Réponse.",
      usedMemoryIds: [],
    })
  })

  it("ignores the explicit none value", () => {
    expect(splitResponseMetadata("Réponse.[[LUMY_MEMORY:none]]")).toEqual({
      content: "Réponse.",
      usedMemoryIds: [],
    })
  })
})
