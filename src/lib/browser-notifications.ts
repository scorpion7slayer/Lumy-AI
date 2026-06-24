const NOTIFICATION_SW_PATH = "/lumy-notifications-sw.js"

export type LumyBrowserNotificationInput = {
  title: string
  body?: string
  tag?: string
  targetUrl?: string | null
}

type LumyNotificationOptions = NotificationOptions & {
  badge?: string
  renotify?: boolean
}

export function browserNotificationsSupported() {
  return typeof window !== "undefined" && "Notification" in window
}

export async function requestLumyNotificationPermission() {
  if (!browserNotificationsSupported()) return "unsupported" as const
  const permission = await Notification.requestPermission()
  if (permission === "granted") {
    await ensureNotificationServiceWorker()
  }
  return permission
}

export async function showLumyBrowserNotification({
  title,
  body,
  tag,
  targetUrl,
}: LumyBrowserNotificationInput) {
  if (!browserNotificationsSupported() || Notification.permission !== "granted")
    return false

  const options: LumyNotificationOptions = {
    body,
    icon: "/lumyailogo.webp",
    badge: "/lumyailogo.webp",
    tag,
    renotify: Boolean(tag),
    data: { targetUrl: targetUrl ?? "/" },
  }
  const registration = await ensureNotificationServiceWorker()

  if (registration?.showNotification) {
    await registration.showNotification(title, options)
    return true
  }

  const notification = new Notification(title, options)
  notification.onclick = () => {
    window.focus()
    if (targetUrl) {
      window.history.pushState({}, "", targetUrl)
    }
    notification.close()
  }
  return true
}

async function ensureNotificationServiceWorker() {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    return null
  }

  try {
    return await navigator.serviceWorker.register(NOTIFICATION_SW_PATH, {
      scope: "/",
    })
  } catch {
    return null
  }
}
