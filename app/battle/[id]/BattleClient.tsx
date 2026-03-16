"use client"

import { useState, useEffect, useRef } from "react"
import type { BattleState, MatchState, Player } from "../../../lib/types"
import { PlacementScreen } from "../../../components/battle/PlacementScreen"
import { PlanningScreen } from "../../../components/battle/PlanningScreen"
import TimelineBar from "../../../components/battle/TimelineBar"
import BattleLog from "../../../components/battle/BattleLog"
import { MatchSummary } from "../../../components/battle/MatchSummary"

interface BattleClientProps {
  initialState: BattleState
  initialMatch: MatchState | null
  sessionToken?: string
  myPlayer?: Player
}

export default function BattleClient({
  initialState,
  initialMatch,
  sessionToken,
  myPlayer,
}: BattleClientProps) {
  const [state, setState] = useState<BattleState>(initialState)
  const [match] = useState<MatchState | null>(initialMatch)
  const isNetplay = Boolean(sessionToken && myPlayer)
  const eventSourceRef = useRef<EventSource | null>(null)

  // Connect to SSE stream in netplay mode
  useEffect(() => {
    if (!isNetplay || !sessionToken) return

    const url = `/api/battle/${initialState.id}/stream?token=${encodeURIComponent(sessionToken)}`
    const es = new EventSource(url)
    eventSourceRef.current = es

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        if (data.type === "battle_state_updated") {
          setState(data.state as BattleState)
        }
      } catch {
        // ignore parse errors
      }
    }

    return () => {
      es.close()
      eventSourceRef.current = null
    }
  }, [isNetplay, sessionToken, initialState.id])

  const { phase } = state

  // In netplay mode, determine whose turn it is to act
  const isMyPlacementTurn =
    !isNetplay ||
    (phase === "placement_p1" && myPlayer === "p1") ||
    (phase === "placement_p2" && myPlayer === "p2")

  const isMyPlanningTurn =
    !isNetplay ||
    phase === "planning" ||
    (phase === "awaiting_p2_orders" && myPlayer === "p2")

  if (phase === "placement_p1" || phase === "placement_p2") {
    const player = phase === "placement_p1" ? "p1" : "p2"
    const field = player === "p1" ? state.p1Field : state.p2Field

    if (!isMyPlacementTurn) {
      return (
        <div className="flex flex-col items-center justify-center gap-4 p-10">
          <p className="text-lg font-semibold">Waiting for opponent…</p>
        </div>
      )
    }

    return (
      <PlacementScreen
        battleId={state.id}
        player={isNetplay ? myPlayer! : player}
        field={isNetplay ? (myPlayer === "p1" ? state.p1Field : state.p2Field) : field}
        onConfirm={setState}
      />
    )
  }

  if (phase === "planning" || phase === "awaiting_p2_orders") {
    if (!isMyPlanningTurn) {
      return (
        <div className="flex flex-col items-center justify-center gap-4 p-10">
          <p className="text-lg font-semibold">Waiting for opponent…</p>
        </div>
      )
    }

    return (
      <div className="flex flex-col h-full w-full">
        <PlanningScreen
          key={state.turn}
          battleId={state.id}
          player={isNetplay ? myPlayer! : "p1"}
          state={state}
          onSubmit={setState}
          sessionToken={sessionToken ?? ""}
        />
        {state.turn > 0 && (
          <div className="px-6 pb-6 w-full max-w-4xl mx-auto">
            <h3 className="text-sm font-semibold mb-2 text-muted-foreground uppercase tracking-wider">Previous Turn Log</h3>
            <BattleLog entries={state.battleLog.filter(e => e.turn === state.turn - 1)} />
          </div>
        )}
      </div>
    )
  }

  if (phase === "resolving" || phase === "end_of_turn" || phase === "reversal_window") {
    return (
      <div className="flex flex-col gap-4 p-6">
        <TimelineBar
          queue={state.resolutionQueue}
          currentIndex={state.currentQueueIndex}
          reversalWindow={state.reversalWindow}
        />
        <BattleLog entries={state.battleLog} />
      </div>
    )
  }

  if (phase === "battle_ended") {
    if (!match) {
      return (
        <div className="flex flex-col items-center gap-4 p-6">
          <p className="text-lg font-semibold">
            Battle ended. Winner: {state.winner ?? "Unknown"}
          </p>
        </div>
      )
    }
    return (
      <MatchSummary
        match={match}
        onPlayAgain={() => {
          window.location.href = "/"
        }}
      />
    )
  }

  return null
}
