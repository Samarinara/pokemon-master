"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import type { SSEEvent, Session } from "@/lib/matchmaking/types"
import ConnectionStatus from "@/components/matchmaking/ConnectionStatus"

type ConnectionStatusType = "connected" | "reconnecting" | "error"

interface WaitingScreenProps {
  joinCode: string
  token: string
  hostName: string
  onJoinerArrived?: (session: Session) => void
}

const RECONNECT_TIMEOUT_MS = 15_000

export default function WaitingScreen({ joinCode, token, hostName, onJoinerArrived }: WaitingScreenProps) {
  const router = useRouter()
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatusType>("connected")
  const esRef = useRef<EventSource | null>(null)
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const reconnectDeadlineRef = useRef<number | null>(null)

  useEffect(() => {
    function clearReconnectTimer() {
      if (reconnectTimerRef.current !== null) {
        clearTimeout(reconnectTimerRef.current)
        reconnectTimerRef.current = null
      }
    }

    function connect() {
      const url = `/api/lobby/${encodeURIComponent(joinCode)}/stream?token=${encodeURIComponent(token)}`
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

        if (event.type === "session_updated") {
          setConnectionStatus("connected")
          if (event.session.lobbyState === "pending_acceptance") {
            onJoinerArrived?.(event.session)
          }
        } else if (event.type === "battle_started" && event.token === token) {
          es.close()
          router.push(`/battle/${event.battleId}?token=${encodeURIComponent(token)}&player=${event.yourPlayer}`)
        } else if (event.type === "session_expired") {
          es.close()
          router.push("/")
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
          router.push("/")
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
    }
  }, [joinCode, token, router])

  return (
    <div className="flex flex-col items-center justify-center gap-6 p-8">
      <h1 className="text-xl font-semibold">Welcome, {hostName}</h1>

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
        <p className="text-sm text-muted-foreground">Waiting for opponent…</p>
      </div>

      <div className="flex flex-col items-center gap-1">
        <p className="text-xs text-muted-foreground">
          Share this code with your opponent:
        </p>
        <span className="font-mono text-lg font-bold tracking-widest">{joinCode}</span>
      </div>

      <ConnectionStatus status={connectionStatus} />
    </div>
  )
}
