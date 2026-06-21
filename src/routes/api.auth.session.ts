import { createFileRoute } from "@tanstack/react-router"
import {
  assertSameOrigin,
  clearSessionCookie,
  destroyRequestSession,
  getRequestUser,
} from "@/lib/auth.server"

export const Route = createFileRoute("/api/auth/session")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const user = await getRequestUser(request)
        return Response.json({ user })
      },
      DELETE: async ({ request }) => {
        assertSameOrigin(request)
        await destroyRequestSession(request)
        return new Response(null, {
          status: 204,
          headers: { "Set-Cookie": clearSessionCookie() },
        })
      },
    },
  },
})
