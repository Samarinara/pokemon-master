"use client"

import type { MatchState } from "../../lib/types"
import { Button } from "../ui/button"

interface MatchSummaryProps {
  match: MatchState
  onPlayAgain: () => void
}

export function MatchSummary({ match, onPlayAgain }: MatchSummaryProps) {
  return (
    <div className="flex flex-col items-center gap-4 p-6">
      <div className="text-lg font-semibold">
        Score: {match.p1Wins} – {match.p2Wins}
      </div>

      {match.complete && match.winner && (
        <div className="text-xl font-bold">
          {match.winner === "p1" ? "Player 1" : "Player 2"} wins the match!
        </div>
      )}

      <Button onClick={onPlayAgain}>Play Again</Button>
    </div>
  )
}
