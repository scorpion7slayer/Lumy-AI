self.addEventListener("notificationclick", (event) => {
  event.notification.close()

  const targetUrl = event.notification.data?.targetUrl || "/"

  event.waitUntil(
    (async () => {
      const url = new URL(targetUrl, self.location.origin).href
      const windows = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      })

      for (const client of windows) {
        if (!client.url.startsWith(self.location.origin)) continue
        if ("navigate" in client && client.url !== url) {
          await client.navigate(url)
        }
        if ("focus" in client) {
          await client.focus()
        }
        return
      }

      if (self.clients.openWindow) {
        await self.clients.openWindow(url)
      }
    })()
  )
})
