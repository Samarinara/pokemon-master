"use client"

import { useState } from "react"
import type { BattleState, MatchState } from "../../../lib/types"
import { PlacementScreen } from "../../../components/battle/PlacementScreen"
import { PlanningScreen } from "../../../components/battle/PlanningScreen"
import TimelineBar from "../../../components/battle/TimelineBar"
import BattleLog from "../../../components/battle/BattleLog"
import { MatchSummary } from "../../../components/battle/MatchSummary"

interface BattleClientProps {
  initialState: BattleState
  initialMatch: MatchState | null
}

export default function BattleClient({ initialState, initialMatch }: BattleClientProps) {
  const [state, setState] = useState<BattleState>(initialState)
  const [match] = useState<MatchState | null>(initialMatch)

  const { phase } = state

  if (phase === "placement_p1" || phase === "placement_p2") {
    const player = phase === "placement_p1" ? "p1" : "p2"
    const field = player === "p1" ? state.p1Field : state.p2Field
    return (
      <PlacementScreen
        battleId={state.id}
        player={player}
        field={field}
        onConfirm={setState}
      />
    )
  }

  if (phase === "planning" || phase === "awaiting_p2_orders") {
    return (
      <PlanningScreen
        battleId={state.id}
        player="p1"
        state={state}
        onSubmit={setState}
      />
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
