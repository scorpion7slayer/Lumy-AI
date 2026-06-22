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
