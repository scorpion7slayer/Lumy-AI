import { Resend } from "resend"

export type VerificationPurpose = "verify_email" | "change_email"

export class EmailConfigurationError extends Error {
  constructor() {
    super("Le service de vérification d’e-mail n’est pas configuré.")
    this.name = "EmailConfigurationError"
  }
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;")
}

export function isEmailDeliveryConfigured() {
  return Boolean(
    process.env.RESEND_API_KEY?.trim() &&
    process.env.RESEND_FROM_EMAIL?.trim() &&
    process.env.APP_URL?.trim()
  )
}

function verificationUrl(token: string) {
  const rawBase = process.env.APP_URL?.trim()
  if (!rawBase) throw new EmailConfigurationError()
  const url = new URL(rawBase)
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new EmailConfigurationError()
  }
  url.pathname = "/"
  url.search = ""
  url.searchParams.set("verify", token)
  return url.toString()
}

function appUrl() {
  const rawBase = process.env.APP_URL?.trim()
  if (!rawBase) throw new EmailConfigurationError()
  const url = new URL(rawBase)
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new EmailConfigurationError()
  }
  url.pathname = "/"
  url.search = ""
  url.hash = ""
  return url.toString()
}

export async function sendVerificationEmail(input: {
  email: string
  name: string
  token: string
  purpose: VerificationPurpose
  idempotencyKey: string
}) {
  const apiKey = process.env.RESEND_API_KEY?.trim()
  const from = process.env.RESEND_FROM_EMAIL?.trim()
  if (!apiKey || !from || !isEmailDeliveryConfigured()) {
    throw new EmailConfigurationError()
  }

  const url = verificationUrl(input.token)
  const changing = input.purpose === "change_email"
  const title = changing
    ? "Confirmez votre nouvelle adresse e-mail"
    : "Vérifiez votre adresse e-mail"
  const action = changing
    ? "Confirmer ma nouvelle adresse"
    : "Vérifier mon e-mail"
  const safeName = escapeHtml(input.name)

  const resend = new Resend(apiKey)
  const { error } = await resend.emails.send(
    {
      from,
      to: [input.email],
      subject: `${title} — Lumy AI`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#171a17">
          <h1 style="font-size:26px">${title}</h1>
          <p>Bonjour ${safeName},</p>
          <p>Cliquez sur le bouton ci-dessous pour confirmer que cette adresse vous appartient. Ce lien expire dans 30 minutes.</p>
          <p style="margin:28px 0">
            <a href="${escapeHtml(url)}" style="background:#171a17;color:#fff;padding:12px 18px;border-radius:10px;text-decoration:none">${action}</a>
          </p>
          <p style="font-size:13px;color:#687068">Si vous n’êtes pas à l’origine de cette demande, ignorez cet e-mail.</p>
          <p style="font-size:12px;color:#858b85">Lumy AI — Powered by Zyranex</p>
        </div>
      `,
    },
    { idempotencyKey: input.idempotencyKey }
  )

  if (error) throw new Error(`Envoi de l’e-mail impossible : ${error.message}`)
}

export async function sendFeedbackNotificationEmail(input: {
  feedbackId: string
  recipients: string[]
  authorName: string
  authorEmail: string
  category: "idea" | "bug" | "other"
  message: string
}) {
  const apiKey = process.env.RESEND_API_KEY?.trim()
  const from = process.env.RESEND_FROM_EMAIL?.trim()
  const recipients = Array.from(
    new Set(input.recipients.map((email) => email.trim()).filter(Boolean))
  )
  if (!apiKey || !from || !recipients.length || !isEmailDeliveryConfigured()) {
    throw new EmailConfigurationError()
  }

  const safeName = escapeHtml(input.authorName)
  const safeEmail = escapeHtml(input.authorEmail)
  const safeCategory = escapeHtml(input.category)
  const safeMessage = escapeHtml(input.message).replaceAll("\n", "<br>")
  const url = appUrl()
  const resend = new Resend(apiKey)
  const { error } = await resend.emails.send(
    {
      from,
      to: recipients,
      subject: `Nouveau feedback ${input.category} — Lumy AI`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:620px;margin:0 auto;color:#171a17">
          <h1 style="font-size:26px">Nouveau feedback Lumy AI</h1>
          <p><strong>${safeName}</strong> (${safeEmail}) a envoyé un feedback de catégorie <strong>${safeCategory}</strong>.</p>
          <div style="margin:24px 0;padding:16px;border:1px solid #d9ddd9;border-radius:10px;line-height:1.6">${safeMessage}</div>
          <p><a href="${escapeHtml(url)}" style="background:#171a17;color:#fff;padding:12px 18px;border-radius:10px;text-decoration:none">Ouvrir l’administration</a></p>
          <p style="font-size:12px;color:#858b85">Lumy AI — Powered by Zyranex</p>
        </div>
      `,
      text: `Nouveau feedback Lumy AI\n\n${input.authorName} (${input.authorEmail})\nCatégorie : ${input.category}\n\n${input.message}\n\n${url}`,
    },
    { idempotencyKey: `lumy-feedback/${input.feedbackId}` }
  )

  if (error) {
    throw new Error(`Notification de feedback impossible : ${error.message}`)
  }
}

function emailClient() {
  const apiKey = process.env.RESEND_API_KEY?.trim()
  const from = process.env.RESEND_FROM_EMAIL?.trim()
  if (!apiKey || !from || !isEmailDeliveryConfigured()) {
    throw new EmailConfigurationError()
  }
  return { resend: new Resend(apiKey), from }
}

export async function sendEarlyAccessRequestEmail(input: {
  userId: string
  recipient: string
  requesterName: string
  requesterEmail: string
}) {
  const { resend, from } = emailClient()
  const url = new URL(appUrl())
  url.searchParams.set("admin", "early-access")
  const { error } = await resend.emails.send(
    {
      from,
      to: [input.recipient],
      subject: "Nouvelle demande d’accès anticipé — Lumy AI",
      html: `
        <div style="font-family:Arial,sans-serif;max-width:620px;margin:0 auto;color:#171a17">
          <h1 style="font-size:26px">Nouvelle demande d’accès anticipé</h1>
          <p><strong>${escapeHtml(input.requesterName)}</strong> (${escapeHtml(input.requesterEmail)}) souhaite accéder à Lumy AI.</p>
          <p>Le compte reste bloqué sur la liste d’attente jusqu’à votre décision.</p>
          <p style="margin:28px 0"><a href="${escapeHtml(url.toString())}" style="background:#171a17;color:#fff;padding:12px 18px;border-radius:10px;text-decoration:none">Examiner la demande</a></p>
          <p style="font-size:12px;color:#858b85">Lumy AI — Powered by Zyranex</p>
        </div>
      `,
      text: `Nouvelle demande d’accès anticipé\n\n${input.requesterName} (${input.requesterEmail}) souhaite accéder à Lumy AI.\n\n${url.toString()}`,
    },
    { idempotencyKey: `lumy-early-access/${input.userId}` }
  )
  if (error) {
    throw new Error(
      `Notification d’accès anticipé impossible : ${error.message}`
    )
  }
}

export async function sendEarlyAccessDecisionEmail(input: {
  userId: string
  recipient: string
  name: string
  status: "approved" | "rejected"
}) {
  const { resend, from } = emailClient()
  const approved = input.status === "approved"
  const url = appUrl()
  const title = approved
    ? "Votre accès anticipé est accepté"
    : "Mise à jour de votre demande d’accès"
  const { error } = await resend.emails.send(
    {
      from,
      to: [input.recipient],
      subject: `${title} — Lumy AI`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:620px;margin:0 auto;color:#171a17">
          <h1 style="font-size:26px">${title}</h1>
          <p>Bonjour ${escapeHtml(input.name)},</p>
          <p>${approved ? "Votre compte peut désormais accéder à Lumy AI." : "Votre demande d’accès anticipé n’a pas été acceptée pour le moment."}</p>
          ${approved ? `<p style="margin:28px 0"><a href="${escapeHtml(url)}" style="background:#171a17;color:#fff;padding:12px 18px;border-radius:10px;text-decoration:none">Ouvrir Lumy AI</a></p>` : ""}
          <p style="font-size:12px;color:#858b85">Lumy AI — Powered by Zyranex</p>
        </div>
      `,
      text: `${title}\n\nBonjour ${input.name},\n\n${approved ? `Votre compte peut désormais accéder à Lumy AI.\n\n${url}` : "Votre demande n’a pas été acceptée pour le moment."}`,
    },
    {
      idempotencyKey: `lumy-early-access-decision/${input.userId}/${input.status}`,
    }
  )
  if (error)
    throw new Error(`Notification de décision impossible : ${error.message}`)
}

export async function sendSecurityAlertEmail(input: {
  incidentId: string
  recipient: string
  affectedEmail: string
  previousRole: string
  repairedRole: string
  reason: string
}) {
  const { resend, from } = emailClient()
  const { error } = await resend.emails.send(
    {
      from,
      to: [input.recipient],
      subject: "Alerte de sécurité administrateur — Lumy AI",
      html: `
        <div style="font-family:Arial,sans-serif;max-width:620px;margin:0 auto;color:#171a17">
          <h1 style="font-size:26px">Rôle super administrateur réparé</h1>
          <p>Une incohérence de rôle a été détectée puis corrigée automatiquement.</p>
          <ul>
            <li>Compte : ${escapeHtml(input.affectedEmail)}</li>
            <li>Ancien rôle : ${escapeHtml(input.previousRole)}</li>
            <li>Rôle restauré : ${escapeHtml(input.repairedRole)}</li>
          </ul>
          <p>${escapeHtml(input.reason)}</p>
          <p style="font-size:12px;color:#858b85">Incident ${escapeHtml(input.incidentId)} · Lumy AI</p>
        </div>
      `,
      text: `Alerte de sécurité Lumy AI\n\nCompte : ${input.affectedEmail}\nAncien rôle : ${input.previousRole}\nRôle restauré : ${input.repairedRole}\n\n${input.reason}\n\nIncident ${input.incidentId}`,
    },
    { idempotencyKey: `lumy-security/${input.incidentId}` }
  )
  if (error) throw new Error(`Alerte de sécurité impossible : ${error.message}`)
}
