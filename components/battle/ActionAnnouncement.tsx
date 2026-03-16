import type { ResolvedAction, BattleState, BirdInstance } from "../../lib/types"

// ── BeatPhase ─────────────────────────────────────────────────────────────────

export type BeatPhase = "announce" | "animating" | "result" | "pausing" | "reversal" | "done"

// ── Helpers ───────────────────────────────────────────────────────────────────

function getActingBird(action: ResolvedAction, state: BattleState): BirdInstance {
  const field = action.player === "p1" ? state.p1Field : state.p2Field
  return field[action.slot as "left" | "right" | "bench"]
}

function getTargetBird(action: ResolvedAction, state: BattleState): BirdInstance | null {
  if (action.order.type !== "attack") return null
  const opponentField = action.player === "p1" ? state.p2Field : state.p1Field
  return opponentField[action.order.targetSlot as "left" | "right"]
}

/**
 * Checks the postSnapshot battleLog for a log entry on the current turn
 * that matches the given substring.
 */
function logContains(postSnapshot: BattleState, substring: string): boolean {
  return postSnapshot.battleLog.some(
    (entry) => entry.turn === postSnapshot.turn && entry.text.includes(substring)
  )
}

// ── formatAnnouncement ────────────────────────────────────────────────────────

/**
 * Pure helper that derives announcement display text by diffing preSnapshot
 * and postSnapshot for the given action.
 *
 * Validates: Requirements 2.2, 2.4, 2.5, 2.6, 2.7
 */
export function formatAnnouncement(
  action: ResolvedAction,
  preSnapshot: BattleState,
  postSnapshot: BattleState
): string {
  const actingBird = getActingBird(action, preSnapshot)
  const actingName = actingBird.bird.name
  const { order } = action

  if (order.type === "attack") {
    const move = actingBird.bird.moves.find((m) => m.id === order.moveId)
    const moveName = move?.name ?? order.moveId
    const targetBird = getTargetBird(action, preSnapshot)
    const targetName = targetBird?.bird.name ?? "unknown"

    // Detect miss: target HP unchanged AND log contains "missed"
    const preTargetBird = getTargetBird(action, preSnapshot)
    const postOpponentField = action.player === "p1" ? postSnapshot.p2Field : postSnapshot.p1Field
    const postTargetBird = postOpponentField[order.targetSlot as "left" | "right"]
    const hpUnchanged = preTargetBird?.currentHp === postTargetBird?.currentHp
    const isMiss = hpUnchanged && logContains(postSnapshot, "missed")

    if (isMiss) {
      return `${actingName} used ${moveName} on ${targetName} — Missed!`
    }

    // Detect crit
    const isCrit = logContains(postSnapshot, "Critical hit!")

    if (isCrit) {
      return `${actingName} used ${moveName} on ${targetName} — Critical Hit!`
    }

    return `${actingName} used ${moveName} on ${targetName}`
  }

  if (order.type === "switch") {
    const preField = action.player === "p1" ? preSnapshot.p1Field : preSnapshot.p2Field
    const outgoingName = preField[order.slot as "left" | "right"].bird.name
    const incomingName = preField.bench.bird.name
    return `${actingName} switched out ${outgoingName} for ${incomingName}`
  }

  if (order.type === "block") {
    return `${actingName} is blocking ${order.height}!`
  }

  return `${actingName} acted`
}

// ── ActionAnnouncement component ──────────────────────────────────────────────

interface ActionAnnouncementProps {
  action: ResolvedAction
  preSnapshot: BattleState
  postSnapshot: BattleState
  beatPhase: BeatPhase
}

export function ActionAnnouncement({
  action,
  preSnapshot,
  postSnapshot,
  beatPhase,
}: ActionAnnouncementProps) {
  if (beatPhase === "done") return null

  const text = formatAnnouncement(action, preSnapshot, postSnapshot)

  const isMiss = text.includes("Missed!")
  const isCrit = text.includes("Critical Hit!")

  return (
    <div className="flex flex-col items-center gap-2 text-center">
      <p className="text-lg font-semibold">{text}</p>
      {isMiss && beatPhase === "result" && (
        <span className="text-yellow-500 font-bold text-xl">Missed!</span>
      )}
      {isCrit && (beatPhase === "animating" || beatPhase === "result") && (
        <span className="text-orange-500 font-bold text-xl">Critical Hit!</span>
      )}
    </div>
  )
}
