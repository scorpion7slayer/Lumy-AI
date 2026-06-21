import { createFileRoute } from "@tanstack/react-router"
import { AuthGate } from "@/components/auth/auth-gate"

export const Route = createFileRoute("/")({ component: App })

function App() {
  return <AuthGate />
}
