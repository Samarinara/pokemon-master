"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import type { Session } from "@/lib/matchmaking/types"
import WaitingScreen from "@/components/matchmaking/WaitingScreen"
import AcceptancePrompt from "@/components/matchmaking/AcceptancePrompt"
import WaitingForHost from "@/components/matchmaking/WaitingForHost"

interface LobbyClientProps {
  session: Session
  token: string
  role: "host" | "joiner"
}

export default function LobbyClient({ session, token, role }: LobbyClientProps) {
  const router = useRouter()
  // Local override: when host declines, switch back to WaitingScreen
  const [showWaiting, setShowWaiting] = useState(false)
  const [currentSession, setCurrentSession] = useState(session)
  const currentLobbyState = currentSession.lobbyState

  const { joinCode } = currentSession

  if (role === "host") {
    if (currentLobbyState === "pending_acceptance" && !showWaiting) {
      const joinerName = currentSession.joiner?.displayName ?? "Unknown"
      return (
        <AcceptancePrompt
          joinerName={joinerName}
          joinCode={joinCode}
          hostToken={token}
          onDeclined={() => setShowWaiting(true)}
        />
      )
    }

    // waiting state, or after host declined (showWaiting=true)
    return (
      <WaitingScreen
        joinCode={joinCode}
        token={token}
        hostName={currentSession.host.displayName}
        onJoinerArrived={(updatedSession: Session) => {
          if (updatedSession) setCurrentSession(updatedSession)
          else setCurrentSession(prev => ({ ...prev, lobbyState: "pending_acceptance" }))
        }}
      />
    )
  }

  // role === "joiner"
  if (currentLobbyState === "pending_acceptance") {
    return (
      <WaitingForHost
        joinCode={joinCode}
        joinerToken={token}
        onDeclined={() => router.push("/")}
      />
    )
  }

  // Fallback — shouldn't normally be reached
  return (
    <div className="flex items-center justify-center p-8">
      <p className="text-sm text-muted-foreground">Loading…</p>
    </div>
  )
}
