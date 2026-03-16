"use client"

import { useState } from "react"
import type { BattleState, PlayerField } from "../../lib/types"
import { confirmPlacement } from "../../lib/actions"
import { BirdCard } from "./BirdCard"
import { Button } from "../ui/button"

interface PlacementScreenProps {
  battleId: string
  player: "p1" | "p2"
  field: PlayerField
  onConfirm: (state: BattleState) => void
}

type SlotAssignment = { left: string | null; right: string | null; bench: string | null }

export function PlacementScreen({ battleId, player, field, onConfirm }: PlacementScreenProps) {
  const birds = [field.left, field.right, field.bench]

  const [assignment, setAssignment] = useState<SlotAssignment>({
    left: null,
    right: null,
    bench: null,
  })
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  function assign(birdId: string, slot: "left" | "right" | "bench") {
    setAssignment((prev) => {
      // Remove this bird from any slot it currently occupies
      const cleared: SlotAssignment = {
        left: prev.left === birdId ? null : prev.left,
        right: prev.right === birdId ? null : prev.right,
        bench: prev.bench === birdId ? null : prev.bench,
      }
      // If another bird is in the target slot, clear it
      const displaced: SlotAssignment = {
        left: cleared.left === null || slot === "left" ? (slot === "left" ? birdId : cleared.left) : cleared.left,
        right: cleared.right === null || slot === "right" ? (slot === "right" ? birdId : cleared.right) : cleared.right,
        bench: cleared.bench === null || slot === "bench" ? (slot === "bench" ? birdId : cleared.bench) : cleared.bench,
      }
      return { ...displaced, [slot]: birdId }
    })
    setError(null)
  }

  const allFilled =
    assignment.left !== null &&
    assignment.right !== null &&
    assignment.bench !== null

  const allDistinct =
    allFilled &&
    new Set([assignment.left, assignment.right, assignment.bench]).size === 3

  const canConfirm = allDistinct

  async function handleConfirm() {
    if (!canConfirm) {
      setError("Assign each bird to a distinct slot (Left, Right, Bench) before confirming.")
      return
    }

    setLoading(true)
    setError(null)

    const result = await confirmPlacement(battleId, player, {
      leftBirdId: assignment.left!,
      rightBirdId: assignment.right!,
      benchBirdId: assignment.bench!,
    })

    setLoading(false)

    if ("error" in result) {
      setError("Invalid placement. Please try again.")
      return
    }

    onConfirm(result)
  }

  return (
    <div className="flex flex-col items-center gap-6 p-6">
      <h2 className="text-lg font-bold">
        {player === "p1" ? "Player 1" : "Player 2"} — Place Your Birds
      </h2>

      <div className="flex flex-wrap gap-6 justify-center">
        {birds.map((instance) => {
          const birdId = instance.bird.id
          const currentSlot =
            assignment.left === birdId
              ? "left"
              : assignment.right === birdId
              ? "right"
              : assignment.bench === birdId
              ? "bench"
              : null

          return (
            <div key={birdId} className="flex flex-col items-center gap-2">
              <BirdCard instance={instance} isActive={currentSlot !== null} />

              <div className="flex gap-1">
                {(["left", "right", "bench"] as const).map((slot) => (
                  <button
                    key={slot}
                    onClick={() => assign(birdId, slot)}
                    className={`px-2 py-1 text-xs rounded border transition-colors capitalize ${
                      currentSlot === slot
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background border-border hover:bg-muted"
                    }`}
                  >
                    {slot}
                  </button>
                ))}
              </div>
            </div>
          )
        })}
      </div>

      {error && (
        <p className="text-sm text-destructive font-medium">{error}</p>
      )}

      <Button onClick={handleConfirm} disabled={!canConfirm || loading}>
        {loading ? "Confirming…" : "Confirm Placement"}
      </Button>
    </div>
  )
}
