import { loadSession } from "@/lib/matchmaking/sessionStore"
import { disconnectFromSession } from "@/lib/matchmaking/actions"

export async function GET(
  request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params
  const url = new URL(request.url)
  const token = url.searchParams.get("token")

  if (!token) {
    return new Response("Unauthorized", { status: 401 })
  }

  const MAX_ATTEMPTS = 3
  const RETRY_DELAY_MS = 100

  let session = await loadSession(code)
  for (let attempt = 1; attempt < MAX_ATTEMPTS; attempt++) {
    if (session && (session.host.token === token || session.joiner?.token === token)) {
      break
    }
    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS))
    session = await loadSession(code)
  }

  if (
    !session ||
    (session.host.token !== token && session.joiner?.token !== token)
  ) {
    return new Response("Unauthorized", { status: 401 })
  }

  const sessionId = code.toUpperCase()
  const encoder = new TextEncoder()

  let heartbeat: ReturnType<typeof setInterval>

  const stream = new ReadableStream({
    start(controller) {
      // Send an initial comment to confirm the connection is open
      controller.enqueue(encoder.encode(": connected\n\n"))

      // Heartbeat every 15s to keep the connection alive and prevent proxy timeouts
      heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": heartbeat\n\n"))
        } catch {
          clearInterval(heartbeat)
        }
      }, 15_000)

      let lastSessionStr = JSON.stringify(session)
      const pollTimer = setInterval(async () => {
        try {
          const freshSession = await loadSession(code)
          if (!freshSession) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "session_expired" })}\n\n`))
            clearInterval(pollTimer)
            return
          }

          if (freshSession.updatedAt > (session?.updatedAt ?? 0)) {
            const freshStr = JSON.stringify(freshSession)
            if (freshStr !== lastSessionStr) {
              lastSessionStr = freshStr
              
              if (freshSession.lobbyState === "in_progress" && freshSession.battleId) {
                const yourPlayer = freshSession.host.token === token ? "p1" : "p2"
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "battle_started", battleId: freshSession.battleId, yourPlayer, token })}\n\n`))
              } else if (session?.lobbyState === "pending_acceptance" && freshSession.lobbyState === "waiting") {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "session_declined" })}\n\n`))
              } else {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "session_updated", session: freshSession })}\n\n`))
              }
              session = freshSession
            }
          }
        } catch {
          // ignore
        }
      }, 1000)

      request.signal.addEventListener("abort", () => {
        clearInterval(heartbeat)
        clearInterval(pollTimer)
        try { controller.close() } catch { /* already closed */ }
        
        // When a player closes the tab or disconnects, clean up the session
        // so that connection codes can be reused.
        disconnectFromSession(code, token).catch(() => { /* ignore */ })
      })
    },
    cancel() {
      clearInterval(heartbeat)
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  })
}
