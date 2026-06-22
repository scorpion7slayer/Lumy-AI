import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"

const COOKIE_NOTICE_KEY = "lumy.cookies.notice.v1"

export function CookieNotice() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    try {
      setOpen(window.localStorage.getItem(COOKIE_NOTICE_KEY) !== "acknowledged")
    } catch {
      setOpen(true)
    }
  }, [])

  if (!open) return null

  return (
    <aside
      className="fixed right-4 bottom-4 z-[100] w-[min(420px,calc(100vw-2rem))] rounded-2xl border border-border bg-popover p-4 text-popover-foreground shadow-xl"
      aria-label="Information sur les cookies"
    >
      <p className="text-sm font-medium">Cookies essentiels</p>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">
        Lumy utilise un cookie de session strictement nécessaire pour vous
        connecter et protéger votre compte. Vos préférences d’interface sont
        enregistrées localement sur cet appareil.
      </p>
      <div className="mt-3 flex justify-end">
        <Button
          size="sm"
          onClick={() => {
            try {
              window.localStorage.setItem(COOKIE_NOTICE_KEY, "acknowledged")
            } catch {
              // Dismissing still works for the current page.
            }
            setOpen(false)
          }}
        >
          J’ai compris
        </Button>
      </div>
    </aside>
  )
}
