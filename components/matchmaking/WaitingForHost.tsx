"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import type { SSEEvent } from "@/lib/matchmaking/types"
import ConnectionStatus from "@/components/matchmaking/ConnectionStatus"

type ConnectionStatusType = "connected" | "reconnecting" | "error"

interface WaitingForHostProps {
  joinCode: string
  joinerToken: string
  onDeclined: () => void
}

const RECONNECT_TIMEOUT_MS = 15_000

export default function WaitingForHost({ joinCode, joinerToken, onDeclined }: WaitingForHostProps) {
  const router = useRouter()
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatusType>("connected")
  const [declinedMessage, setDeclinedMessage] = useState<string | null>(null)
  const esRef = useRef<EventSource | null>(null)
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const reconnectDeadlineRef = useRef<number | null>(null)
  const declinedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    function clearReconnectTimer() {
      if (reconnectTimerRef.current !== null) {
        clearTimeout(reconnectTimerRef.current)
        reconnectTimerRef.current = null
      }
    }

    function connect() {
      const url = `/api/lobby/${encodeURIComponent(joinCode)}/stream?token=${encodeURIComponent(joinerToken)}`
      const es = new EventSource(url)
      esRef.current = es

      es.onopen = () => {
        setConnectionStatus("connected")
        clearReconnectTimer()
        reconnectDeadlineRef.current = null
      }

      es.onmessage = (e: MessageEvent) => {
        let event: SSEEvent
        try {
          event = JSON.parse(e.data) as SSEEvent
        } catch {
          return
        }

        if (event.type === "session_declined") {
          es.close()
          setDeclinedMessage("The host declined your request.")
          declinedTimerRef.current = setTimeout(() => {
            onDeclined()
          }, 3_000)
        } else if (event.type === "battle_started" && event.token === joinerToken) {
          es.close()
          router.push(
            `/battle/${event.battleId}?token=${encodeURIComponent(joinerToken)}&player=${event.yourPlayer}`
          )
        } else if (event.type === "session_expired") {
          es.close()
          setDeclinedMessage("The session has expired.")
          onDeclined()
        } else if (event.type === "session_updated") {
          setConnectionStatus("connected")
        }
      }

      es.onerror = () => {
        es.close()
        esRef.current = null

        const now = Date.now()
        if (reconnectDeadlineRef.current === null) {
          reconnectDeadlineRef.current = now + RECONNECT_TIMEOUT_MS
        }

        if (now < reconnectDeadlineRef.current) {
          setConnectionStatus("reconnecting")
          reconnectTimerRef.current = setTimeout(connect, 2_000)
        } else {
          setConnectionStatus("error")
          onDeclined()
        }
      }
    }

    connect()

    return () => {
      esRef.current?.close()
      esRef.current = null
      if (reconnectTimerRef.current !== null) {
        clearTimeout(reconnectTimerRef.current)
      }
      if (declinedTimerRef.current !== null) {
        clearTimeout(declinedTimerRef.current)
      }
    }
  }, [joinCode, joinerToken, router, onDeclined])

  if (declinedMessage) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 p-8">
        <p className="text-base font-medium text-destructive" role="alert">
          {declinedMessage}
        </p>
        <p className="text-sm text-muted-foreground">Returning to form…</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center justify-center gap-6 p-8">
      <h1 className="text-xl font-semibold">Waiting for host to respond…</h1>

      <div className="flex flex-col items-center gap-3">
        {/* Spinner */}
        <svg
          className="h-10 w-10 animate-spin text-foreground/60"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
          />
        </svg>
        <p className="text-sm text-muted-foreground">The host is reviewing your request…</p>
      </div>

      <ConnectionStatus status={connectionStatus} />
    </div>
  )
}
