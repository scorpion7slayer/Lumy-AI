// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { CookieNotice } from "@/components/cookie-notice"

describe("cookie notice", () => {
  beforeEach(() => window.localStorage.clear())
  afterEach(cleanup)

  it("explique les cookies essentiels puis mémorise la fermeture", () => {
    const firstRender = render(<CookieNotice />)
    expect(
      screen.getByRole("complementary", {
        name: "Information sur les cookies",
      })
    ).toBeTruthy()

    fireEvent.click(screen.getByRole("button", { name: "J’ai compris" }))
    expect(window.localStorage.getItem("lumy.cookies.notice.v1")).toBe(
      "acknowledged"
    )
    firstRender.unmount()

    render(<CookieNotice />)
    expect(
      screen.queryByRole("complementary", {
        name: "Information sur les cookies",
      })
    ).toBeNull()
  })
})
