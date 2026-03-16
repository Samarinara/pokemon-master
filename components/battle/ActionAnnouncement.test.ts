import { describe, it, expect } from "vitest"
import * as fc from "fast-check"
import { formatAnnouncement } from "./ActionAnnouncement"
import { arbPrePostStatePair } from "../../lib/test-utils/arbitraries"
import type { BattleState } from "../../lib/types"

/**
 * Property 3: Beat announcement contains required fields
 * Validates: Requirements 2.2
 *
 * For any ResolvedAction in the resolution queue, the announcement rendered
 * for that beat shall contain: the acting bird's name, and — when the action
 * is an attack — the move name.
 */
describe("formatAnnouncement", () => {
  it("Property 3: announcement contains acting bird name and move name for attacks", () => {
    fc.assert(
      fc.property(arbPrePostStatePair(), ({ preState, postState }) => {
        // Skip states with empty resolution queues
        if (preState.resolutionQueue.length === 0) return

        // Build per-action snapshots: preSnapshot[i] = state before action i
        // postSnapshot[i] = state after action i (from buildSnapshots)
        // For simplicity, use preState as preSnapshot and postState as postSnapshot
        // for the first action in the queue (index 0)
        const action = preState.resolutionQueue[0]

        // preSnapshot is the state before this action (preState itself for index 0)
        const preSnapshot: BattleState = preState
        // postSnapshot is the state after this action — use postState as an approximation
        // (the battleLog in postState contains all entries for this turn)
        const postSnapshot: BattleState = postState

        const text = formatAnnouncement(action, preSnapshot, postSnapshot)

        // Get the acting bird's name
        const actingField = action.player === "p1" ? preState.p1Field : preState.p2Field
        const actingBird = actingField[action.slot as "left" | "right"]
        const actingName = actingBird.bird.name

        // The announcement must contain the acting bird's name
        expect(text).toContain(actingName)

        // For attack orders, the announcement must contain the move name
        if (action.order.type === "attack") {
          const move = actingBird.bird.moves.find((m) => m.id === action.order.moveId)
          if (move) {
            expect(text).toContain(move.name)
          }
        }
      }),
      { numRuns: 100 }
    )
  })
})
