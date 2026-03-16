"use client"

import { useState, useEffect, useCallback } from "react"
import type { BattleState, OrderSet, Order, Move, BirdInstance } from "../../lib/types"
import { submitOrders } from "../../lib/actions"
import { getTypeMultiplier, getStabMultiplier, computeTrueAcc } from "../../lib/engine"
import { BirdCard } from "./BirdCard"
import { Button } from "../ui/button"

interface PlanningScreenProps {
  battleId: string
  player: "p1" | "p2"
  state: BattleState
  onSubmit: (newState: BattleState) => void
  sessionToken?: string
}

type OrderType = "attack" | "blockHigh" | "blockLow" | "switch"

interface SlotSelection {
  orderType: OrderType
  moveId: string | null
  targetSlot: "left" | "right" | null
}

const DEFAULT_SELECTION: SlotSelection = {
  orderType: "attack",
  moveId: null,
  targetSlot: "left",
}

function DamagePreview({
  attacker,
  moveId,
  targetSlot,
  opponentField,
}: {
  attacker: BirdInstance
  moveId: string | null
  targetSlot: "left" | "right"
  opponentField: { left: BirdInstance; right: BirdInstance }
}) {
  if (!moveId) return null
  const move = attacker.bird.moves.find((m) => m.id === moveId)
  if (!move) return null

  const defender = opponentField[targetSlot]
  const stab = getStabMultiplier(attacker.bird, move)
  const type = getTypeMultiplier(move.colour, defender.bird.colour)
  const acc = computeTrueAcc(move.accuracy, attacker.currentSpirit)

  return (
    <div className="mt-1 text-xs text-muted-foreground space-y-0.5">
      <div>
        STAB: <span className={stab > 1 ? "text-green-500 font-semibold" : ""}>{stab.toFixed(1)}×</span>
        {" · "}
        Type: <span className={type > 1 ? "text-green-500 font-semibold" : type < 1 ? "text-red-500 font-semibold" : ""}>{type.toFixed(1)}×</span>
        {" · "}
        Acc: <span>{acc.toFixed(0)}%</span>
      </div>
    </div>
  )
}

function SlotOrderSelector({
  label,
  instance,
  selection,
  onChange,
  opponentField,
}: {
  label: string
  instance: BirdInstance
  selection: SlotSelection
  onChange: (s: SlotSelection) => void
  opponentField: { left: BirdInstance; right: BirdInstance }
}) {
  const moves = instance.bird.moves

  return (
    <div className="flex flex-col items-center gap-3 w-56">
      <div className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">{label}</div>
      <BirdCard instance={instance} isActive />

      {/* Order type selector */}
      <div className="w-full space-y-1">
        {(["attack", "blockHigh", "blockLow", "switch"] as OrderType[]).map((type) => (
          <button
            key={type}
            onClick={() => onChange({ ...selection, orderType: type })}
            className={`w-full text-left px-2 py-1.5 text-xs rounded border transition-colors ${
              selection.orderType === type
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background border-border hover:bg-muted"
            }`}
          >
            {type === "attack" && "⚔️ Attack"}
            {type === "blockHigh" && "🛡️ Block High"}
            {type === "blockLow" && "🛡️ Block Low"}
            {type === "switch" && "🔄 Switch"}
          </button>
        ))}
      </div>

      {/* Attack sub-options */}
      {selection.orderType === "attack" && (
        <div className="w-full space-y-2">
          {/* Move picker */}
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground font-medium">Move</div>
            {moves.map((move: Move) => (
              <button
                key={move.id}
                onClick={() => onChange({ ...selection, moveId: move.id })}
                className={`w-full text-left px-2 py-1 text-xs rounded border transition-colors ${
                  selection.moveId === move.id
                    ? "bg-secondary text-secondary-foreground border-secondary"
                    : "bg-background border-border hover:bg-muted"
                }`}
              >
                <span className="font-medium">{move.name}</span>
                <span className="ml-1 text-muted-foreground">({move.colour} · {move.height} · {move.powerTier})</span>
              </button>
            ))}
          </div>

          {/* Target picker */}
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground font-medium">Target</div>
            <div className="flex gap-1">
              {(["left", "right"] as const).map((slot) => (
                <button
                  key={slot}
                  onClick={() => onChange({ ...selection, targetSlot: slot })}
                  className={`flex-1 px-2 py-1 text-xs rounded border transition-colors capitalize ${
                    selection.targetSlot === slot
                      ? "bg-secondary text-secondary-foreground border-secondary"
                      : "bg-background border-border hover:bg-muted"
                  }`}
                >
                  {slot}
                </button>
              ))}
            </div>
          </div>

          {/* Damage preview */}
          {selection.moveId && selection.targetSlot && (
            <DamagePreview
              attacker={instance}
              moveId={selection.moveId}
              targetSlot={selection.targetSlot}
              opponentField={opponentField}
            />
          )}
        </div>
      )}
    </div>
  )
}

function buildOrder(slot: "left" | "right", selection: SlotSelection): Order | null {
  if (selection.orderType === "attack") {
    if (!selection.moveId || !selection.targetSlot) return null
    return { type: "attack", slot, moveId: selection.moveId, targetSlot: selection.targetSlot }
  }
  if (selection.orderType === "blockHigh") {
    return { type: "block", slot, height: "High" }
  }
  if (selection.orderType === "blockLow") {
    return { type: "block", slot, height: "Low" }
  }
  // switch
  return { type: "switch", slot }
}

export function PlanningScreen({ battleId, player, state, onSubmit, sessionToken }: PlanningScreenProps) {
  const myField = player === "p1" ? state.p1Field : state.p2Field
  const opponentField = player === "p1" ? state.p2Field : state.p1Field

  const [leftSel, setLeftSel] = useState<SlotSelection>({ ...DEFAULT_SELECTION })
  const [rightSel, setRightSel] = useState<SlotSelection>({ ...DEFAULT_SELECTION })
  const [timeLeft, setTimeLeft] = useState(15)
  const [locked, setLocked] = useState(false)
  const [loading, setLoading] = useState(false)

  const canLock =
    buildOrder("left", leftSel) !== null && buildOrder("right", rightSel) !== null

  const handleLockIn = useCallback(async () => {
    if (locked) return
    const leftOrder = buildOrder("left", leftSel)
    const rightOrder = buildOrder("right", rightSel)

    // Fall back to block high if incomplete
    const finalLeft: Order = leftOrder ?? { type: "block", slot: "left", height: "High" }
    const finalRight: Order = rightOrder ?? { type: "block", slot: "right", height: "High" }

    const orders: OrderSet = { left: finalLeft, right: finalRight }

    setLocked(true)
    setLoading(true)
    try {
      const result = await submitOrders(battleId, player, orders, sessionToken ?? "")
      if ("error" in result) {
        // In netplay mode, token errors or already-resolved turns are handled gracefully
        setLocked(false)
        return
      }
      onSubmit(result)
    } finally {
      setLoading(false)
    }
  }, [locked, leftSel, rightSel, battleId, player, onSubmit])

  // Countdown timer
  useEffect(() => {
    if (locked) return
    if (timeLeft <= 0) {
      handleLockIn()
      return
    }
    const id = setTimeout(() => setTimeLeft((t) => t - 1), 1000)
    return () => clearTimeout(id)
  }, [timeLeft, locked, handleLockIn])

  if (locked) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 p-10">
        <p className="text-lg font-semibold">Orders submitted, waiting for opponent…</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center gap-6 p-6">
      <div className="flex items-center gap-4">
        <h2 className="text-lg font-bold">
          {player === "p1" ? "Player 1" : "Player 2"} — Planning Phase
        </h2>
        <div
          className={`text-sm font-mono font-bold px-2 py-0.5 rounded ${
            timeLeft <= 5 ? "bg-red-500 text-white" : "bg-muted text-foreground"
          }`}
        >
          {timeLeft}s
        </div>
      </div>

      <div className="flex gap-8 flex-wrap justify-center">
        <SlotOrderSelector
          label="Left Bird"
          instance={myField.left}
          selection={leftSel}
          onChange={setLeftSel}
          opponentField={{ left: opponentField.left, right: opponentField.right }}
        />
        <SlotOrderSelector
          label="Right Bird"
          instance={myField.right}
          selection={rightSel}
          onChange={setRightSel}
          opponentField={{ left: opponentField.left, right: opponentField.right }}
        />
      </div>

      <Button onClick={handleLockIn} disabled={!canLock || loading}>
        {loading ? "Locking in…" : "Lock In"}
      </Button>
    </div>
  )
}
