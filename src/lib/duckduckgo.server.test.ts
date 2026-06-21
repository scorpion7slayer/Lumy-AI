import { describe, expect, it } from "vitest"
import {
  buildDuckDuckGoQuery,
  normalizeDuckDuckGoUrl,
  parseDuckDuckGoHtml,
} from "@/lib/duckduckgo.server"

describe("DuckDuckGo HTML results", () => {
  it("adds the previous question when the search request is contextual", () => {
    expect(
      buildDuckDuckGoQuery([
        "Comment créer un site web ?",
        "Recherche un site qui l’explique bien",
      ])
    ).toBe("Comment créer un site web ? Recherche un site qui l’explique bien")
    expect(
      buildDuckDuckGoQuery([
        "Comment créer un site web ?",
        "Météo à Bruxelles demain",
      ])
    ).toBe("Météo à Bruxelles demain")
  })

  it("extracts text results and resolves redirect URLs", () => {
    const html = `
      <div class="result">
        <a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fguide&amp;rut=x">
          Guide &amp; documentation
        </a>
        <a class="result__snippet">Une réponse <b>claire</b> et utile.</a>
      </div>`

    expect(parseDuckDuckGoHtml(html)).toEqual([
      {
        title: "Guide & documentation",
        url: "https://example.com/guide",
        snippet: "Une réponse claire et utile.",
      },
    ])
  })

  it("keeps direct result URLs", () => {
    expect(normalizeDuckDuckGoUrl("https://example.org/page")).toBe(
      "https://example.org/page"
    )
  })
})
