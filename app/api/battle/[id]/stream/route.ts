import { loadBattle } from "@/lib/store"

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const url = new URL(request.url)
  const token = url.searchParams.get("token")

  if (!token) {
    return new Response("Unauthorized", { status: 401 })
  }

  const sessionId = id
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(": connected\n\n"))

      let lastStateStr = ""
      const pollTimer = setInterval(async () => {
        try {
          const freshState = await loadBattle(id)
          if (freshState) {
            const freshStr = JSON.stringify(freshState)
            if (freshStr !== lastStateStr) {
              lastStateStr = freshStr
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "battle_state_updated", state: freshState })}\n\n`))
            }
          }
        } catch {
          // ignore
        }
      }, 1000)

      let heartbeat = setInterval(() => {
        try { controller.enqueue(encoder.encode(": heartbeat\n\n")) } catch { clearInterval(heartbeat) }
      }, 15000)

      request.signal.addEventListener("abort", () => {
        clearInterval(pollTimer)
        clearInterval(heartbeat)
        try { controller.close() } catch { /* ignore */ }
      })
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
