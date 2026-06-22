import { randomUUID } from "node:crypto"
import { createFileRoute } from "@tanstack/react-router"
import {
  assertSameOrigin,
  enforceAuthRateLimit,
  requireRequestUser,
} from "@/lib/auth.server"
import {
  insertFeedback,
  listAdminNotificationRecipients,
} from "@/lib/db.server"
import {
  isEmailDeliveryConfigured,
  sendFeedbackNotificationEmail,
} from "@/lib/email.server"

export const Route = createFileRoute("/api/feedback")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        assertSameOrigin(request)
        enforceAuthRateLimit(request, "feedback")
        const user = await requireRequestUser(request)
        const body = (await request.json().catch(() => ({}))) as {
          category?: unknown
          message?: unknown
        }
        const category = ["idea", "bug", "other"].includes(
          String(body.category)
        )
          ? (body.category as "idea" | "bug" | "other")
          : "other"
        const message =
          typeof body.message === "string" ? body.message.trim() : ""
        if (message.length < 10 || message.length > 2_000) {
          return Response.json(
            {
              error:
                "Le commentaire doit contenir entre 10 et 2 000 caractères.",
            },
            { status: 400 }
          )
        }
        const feedbackId = randomUUID()
        await insertFeedback({
          id: feedbackId,
          userId: user.id,
          category,
          message,
        })

        let notificationSent = false
        if (isEmailDeliveryConfigured()) {
          try {
            const recipients = await listAdminNotificationRecipients()
            if (recipients.length) {
              await sendFeedbackNotificationEmail({
                feedbackId,
                recipients: recipients.map((admin) => admin.email),
                authorName: user.name,
                authorEmail: user.email,
                category,
                message,
              })
              notificationSent = true
            }
          } catch (error) {
            console.error(
              "Feedback saved, but admin notification failed.",
              error
            )
          }
        }

        return Response.json(
          { received: true, notificationSent },
          { status: 201 }
        )
      },
    },
  },
})
