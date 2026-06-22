import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { sendFeedbackNotificationEmail } from "@/lib/email.server"

const { send } = vi.hoisted(() => ({ send: vi.fn() }))

vi.mock("resend", () => ({
  Resend: class {
    emails = { send }
  },
}))

describe("notifications e-mail", () => {
  beforeEach(() => {
    process.env.RESEND_API_KEY = "test-key"
    process.env.RESEND_FROM_EMAIL = "Lumy <lumy@example.test>"
    process.env.APP_URL = "http://localhost:3000"
    send.mockResolvedValue({ data: { id: "email-1" }, error: null })
  })

  afterEach(() => {
    delete process.env.RESEND_API_KEY
    delete process.env.RESEND_FROM_EMAIL
    delete process.env.APP_URL
    vi.clearAllMocks()
  })

  it("notifie tous les administrateurs sans injecter le contenu HTML du feedback", async () => {
    await sendFeedbackNotificationEmail({
      feedbackId: "feedback-1",
      recipients: ["admin-a@example.test", "admin-b@example.test"],
      authorName: "<Marie>",
      authorEmail: "marie@example.test",
      category: "bug",
      message: "La page <script>alert(1)</script> ne répond plus.",
    })

    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: ["admin-a@example.test", "admin-b@example.test"],
        subject: "Nouveau feedback bug — Lumy AI",
        html: expect.stringContaining("&lt;script&gt;alert(1)&lt;/script&gt;"),
      }),
      { idempotencyKey: "lumy-feedback/feedback-1" }
    )
  })
})
