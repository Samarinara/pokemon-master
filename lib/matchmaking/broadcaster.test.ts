import { describe, it, expect, vi } from "vitest"
import { subscribe, publish } from "./broadcaster"
import type { SSEEvent } from "./types"

const sessionEvent: SSEEvent = { type: "session_expired" }

describe("broadcaster", () => {
  it("delivers published events to all subscribers for a session", () => {
    const received1: SSEEvent[] = []
    const received2: SSEEvent[] = []

    const unsub1 = subscribe("session-a", (e) => received1.push(e))
    const unsub2 = subscribe("session-a", (e) => received2.push(e))

    publish("session-a", sessionEvent)

    expect(received1).toEqual([sessionEvent])
    expect(received2).toEqual([sessionEvent])

    unsub1()
    unsub2()
  })

  it("stops delivering events after unsubscribing", () => {
    const received: SSEEvent[] = []
    const unsub = subscribe("session-b", (e) => received.push(e))

    publish("session-b", sessionEvent)
    unsub()
    publish("session-b", sessionEvent)

    expect(received).toHaveLength(1)
  })

  it("does not deliver events to subscribers of a different session", () => {
    const receivedA: SSEEvent[] = []
    const receivedB: SSEEvent[] = []

    const unsubA = subscribe("session-c", (e) => receivedA.push(e))
    const unsubB = subscribe("session-d", (e) => receivedB.push(e))

    publish("session-c", sessionEvent)

    expect(receivedA).toHaveLength(1)
    expect(receivedB).toHaveLength(0)

    unsubA()
    unsubB()
  })
})
