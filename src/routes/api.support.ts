import { randomUUID } from "node:crypto"
import { createFileRoute } from "@tanstack/react-router"
import { assertSameOrigin, requireRequestUser } from "@/lib/auth.server"
import {
  acceptSupportHandoff,
  claimSupportTicket,
  closeSupportTicket,
  consumeRateLimit,
  createSupportTicket,
  insertSupportMessage,
  listSupportAdminRecipients,
  listSupportMessages,
  listSupportTickets,
  requestSupportHandoff,
} from "@/lib/db.server"
import { sendSupportTicketOpenedEmail } from "@/lib/email.server"
import { readLimitedJsonObject } from "@/lib/request-guards.server"

export const Route = createFileRoute("/api/support")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const user = await requireRequestUser(request)
        const ticketId = new URL(request.url).searchParams
          .get("ticketId")
          ?.trim()
        const isAdmin = user.capabilities.adminAccess
        const tickets = await listSupportTickets(user.id, isAdmin)
        const messages = ticketId
          ? await listSupportMessages({
              ticketId,
              viewerUserId: user.id,
              viewerIsAdmin: isAdmin,
            })
          : []
        return Response.json({ tickets, messages })
      },
      POST: async ({ request }) => {
        assertSameOrigin(request)
        const user = await requireRequestUser(request)
        const body = await readLimitedJsonObject(request)
        const action = body.action === "message" ? "message" : "create"
        if (action === "create") {
          const subject =
            typeof body.subject === "string" ? body.subject.trim() : ""
          const message =
            typeof body.message === "string" ? body.message.trim() : ""
          if (
            subject.length < 3 ||
            subject.length > 160 ||
            message.length < 3 ||
            message.length > 10_000
          ) {
            return Response.json(
              { error: "Le sujet ou le message est invalide." },
              { status: 400 }
            )
          }
          const id = randomUUID()
          const result = await createSupportTicket({
            id,
            requesterUserId: user.id,
            subject,
            firstMessage: message,
          })
          if (!result.ok) {
            return Response.json(
              {
                error:
                  result.reason === "active_ticket"
                    ? "Vous avez déjà un ticket en cours."
                    : "Vous pourrez ouvrir un nouveau ticket dans une heure.",
              },
              {
                status: 429,
                headers: { "Retry-After": String(result.retryAfterSeconds) },
              }
            )
          }
          try {
            const recipients = await listSupportAdminRecipients()
            if (recipients.length) {
              await sendSupportTicketOpenedEmail({
                ticketId: id,
                recipients: recipients.map((admin) => admin.email),
                requesterName: user.name,
                requesterEmail: user.email,
                subject,
              })
            }
          } catch (error) {
            console.error(
              "[Lumy] Ticket enregistré mais notification e-mail impossible",
              error
            )
          }
          return Response.json({ ticketId: id }, { status: 201 })
        }

        const rate = await consumeRateLimit({
          scope: `support-message:${user.id}`,
          limit: 20,
          windowSeconds: 60,
        })
        if (!rate.allowed) {
          return Response.json(
            { error: "Vous envoyez trop de messages." },
            {
              status: 429,
              headers: { "Retry-After": String(rate.retryAfterSeconds) },
            }
          )
        }
        const ticketId =
          typeof body.ticketId === "string" ? body.ticketId.trim() : ""
        const content =
          typeof body.message === "string" ? body.message.trim() : ""
        if (!ticketId || content.length < 1 || content.length > 10_000) {
          return Response.json({ error: "Message invalide." }, { status: 400 })
        }
        const sent = await insertSupportMessage({
          id: randomUUID(),
          ticketId,
          authorUserId: user.id,
          authorIsAdmin: user.capabilities.adminAccess,
          content,
        })
        return sent
          ? Response.json({ sent: true }, { status: 201 })
          : Response.json(
              { error: "Vous ne pouvez pas écrire dans ce ticket." },
              { status: 403 }
            )
      },
      PATCH: async ({ request }) => {
        assertSameOrigin(request)
        const user = await requireRequestUser(request)
        const body = await readLimitedJsonObject(request)
        const action = typeof body.action === "string" ? body.action : ""
        const ticketId =
          typeof body.ticketId === "string" ? body.ticketId.trim() : ""
        if (!ticketId)
          return Response.json({ error: "Ticket requis." }, { status: 400 })
        if (action === "close") {
          const updated = await closeSupportTicket({
            ticketId,
            actorUserId: user.id,
            actorIsAdmin: user.capabilities.adminAccess,
          })
          return updated
            ? Response.json({ updated: true })
            : Response.json({ error: "Ticket introuvable." }, { status: 404 })
        }
        if (!user.capabilities.adminAccess) {
          return Response.json(
            { error: "Accès administrateur requis." },
            { status: 403 }
          )
        }
        let updated = false
        if (action === "claim")
          updated = await claimSupportTicket(ticketId, user.id)
        else if (action === "handoff") {
          const targetAdminUserId =
            typeof body.targetAdminUserId === "string"
              ? body.targetAdminUserId.trim()
              : ""
          updated =
            Boolean(targetAdminUserId) &&
            (await requestSupportHandoff({
              ticketId,
              currentAdminUserId: user.id,
              targetAdminUserId,
            }))
        } else if (action === "accept_handoff")
          updated = await acceptSupportHandoff(ticketId, user.id)
        else
          return Response.json({ error: "Action invalide." }, { status: 400 })
        return updated
          ? Response.json({ updated: true })
          : Response.json(
              {
                error:
                  "Le ticket a déjà été pris en charge ou son état a changé.",
              },
              { status: 409 }
            )
      },
    },
  },
})
