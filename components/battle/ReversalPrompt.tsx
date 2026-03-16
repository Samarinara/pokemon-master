"use client"

import { useEffect, useState } from "react"
import type { ReversalWindowState, BirdInstance, Move } from "../../lib/types"
import { Button } from "../ui/button"

interface ReversalPromptProps {
  reversalWindow: ReversalWindowState
  benchBird?: BirdInstance
  onDecision: (accepted: boolean, moveId?: string) => void
}

const COUNTDOWN_SECONDS = 3

export default function ReversalPrompt({
  reversalWindow,
  benchBird,
  onDecision,
}: ReversalPromptProps) {
  const [countdown, setCountdown] = useState(COUNTDOWN_SECONDS)
  const [accepted, setAccepted] = useState(false)

  useEffect(() => {
    if (accepted) return
    if (countdown <= 0) {
      onDecision(false)
      return
    }
    const timer = setTimeout(() => setCountdown((c) => c - 1), 1000)
    return () => clearTimeout(timer)
  }, [countdown, accepted, onDecision])

  const reversalMoves: Move[] = benchBird
    ? benchBird.bird.moves.filter((m) => m.flags.reversalLegal)
    : []

  function handleAccept() {
    if (reversalMoves.length === 0) {
      onDecision(true)
      return
    }
    setAccepted(true)
  }

  function handleDecline() {
    onDecision(false)
  }

  function handleMoveSelect(moveId: string) {
    onDecision(true, moveId)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-80 rounded border border-border bg-background p-4 shadow-lg">
        {!accepted ? (
          <>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-medium">Reversal Window</span>
              <span className="text-sm tabular-nums text-muted-foreground">
                {countdown}s
              </span>
            </div>
            <p className="mb-4 text-xs text-muted-foreground">
              {benchBird
                ? `Send in ${benchBird.bird.name} for a reversal?`
                : "Perform a reversal?"}
            </p>
            <div className="flex gap-2">
              <Button
                variant="default"
                size="sm"
                className="flex-1"
                onClick={handleAccept}
                disabled={!benchBird}
              >
                Accept
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={handleDecline}
              >
                Decline
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="mb-3 text-sm font-medium">
              Choose a reversal move for {benchBird?.bird.name}
            </p>
            <div className="flex flex-col gap-2">
              {reversalMoves.map((move) => (
                <Button
                  key={move.id}
                  variant="outline"
                  size="sm"
                  className="w-full justify-start"
                  onClick={() => handleMoveSelect(move.id)}
                >
                  <span className="mr-2 text-xs text-muted-foreground">
                    [{move.colour}]
                  </span>
                  {move.name}
                </Button>
              ))}
              {reversalMoves.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  No reversal-legal moves available.
                </p>
              )}
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="mt-3 w-full"
              onClick={handleDecline}
            >
              Cancel
            </Button>
          </>
        )}
      </div>
    </div>
  )
}
