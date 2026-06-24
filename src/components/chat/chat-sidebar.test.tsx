// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ChatSidebar } from "@/components/chat/chat-sidebar"

describe("barre latérale des discussions", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      }
    )
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it("tronque visuellement un titre long sans perdre son contenu accessible", () => {
    const longTitle =
      "Une discussion avec un titre volontairement très long qui doit rester lisible au clavier"

    render(
      <ChatSidebar
        conversations={[
          {
            id: "chat-1",
            title: longTitle,
            messages: [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ]}
        activeId="chat-1"
        onSelect={vi.fn()}
        onNew={vi.fn()}
        onDelete={vi.fn()}
        onRename={vi.fn()}
        onTogglePinned={vi.fn()}
        onOpenMemory={vi.fn()}
        onOpenLibrary={vi.fn()}
        onOpenSupport={vi.fn()}
        onOpenNotifications={vi.fn()}
        onOpenSettings={vi.fn()}
        onOpenFeedback={vi.fn()}
        onOpenAdmin={vi.fn()}
        onLogout={vi.fn()}
        unreadNotifications={0}
        user={{
          id: "user-1",
          email: "user@example.test",
          name: "Utilisateur Test",
          createdAt: "2026-06-22T12:00:00.000Z",
          role: "user",
          accessStatus: "approved",
          capabilities: {
            appAccess: true,
            adminAccess: false,
            superAdminAccess: false,
          },
          emailVerified: true,
          disabled: false,
        }}
      />
    )

    const title = screen.getByTitle(longTitle)
    expect(title.textContent).toBe(longTitle)
    expect(title.className).toContain("truncate")
    expect(
      screen.getByLabelText(`Actions pour ${longTitle}`).className
    ).toContain("group-focus-within:opacity-100")
  })
})
