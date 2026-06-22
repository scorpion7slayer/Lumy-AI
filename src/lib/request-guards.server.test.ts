import { describe, expect, it } from "vitest"
import { readLimitedJsonObject } from "@/lib/request-guards.server"

describe("readLimitedJsonObject", () => {
  it("accepte un petit objet JSON", async () => {
    const result = await readLimitedJsonObject(
      new Request("http://localhost/api/test", {
        method: "POST",
        body: JSON.stringify({ message: "bonjour" }),
      })
    )
    expect(result).toEqual({ message: "bonjour" })
  })

  it("refuse aussi un corps chunked qui dépasse la limite réelle", async () => {
    const error = await readLimitedJsonObject(
      new Request("http://localhost/api/test", {
        method: "POST",
        body: JSON.stringify({ message: "x".repeat(100) }),
      }),
      32
    ).catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(Response)
    expect((error as Response).status).toBe(413)
  })
})
