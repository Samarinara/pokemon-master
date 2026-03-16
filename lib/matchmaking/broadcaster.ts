import { EventEmitter } from "events"
import type { SSEEvent } from "./types"

const globalEmitter = globalThis as unknown as { __sse_emitter?: EventEmitter }
if (!globalEmitter.__sse_emitter) {
  globalEmitter.__sse_emitter = new EventEmitter()
  globalEmitter.__sse_emitter.setMaxListeners(100)
}
const emitter = globalEmitter.__sse_emitter

export function subscribe(sessionId: string, onEvent: (event: SSEEvent) => void): () => void {
  emitter.on(sessionId, onEvent)
  return () => emitter.off(sessionId, onEvent)
}

export function publish(sessionId: string, event: SSEEvent): void {
  emitter.emit(sessionId, event)
}
