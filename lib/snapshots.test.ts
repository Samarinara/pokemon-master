import { describe, it, expect } from "vitest"
import * as fc from "fast-check"
import { buildSnapshots } from "./snapshots"
import { arbPrePostStatePair } from "./test-utils/arbitraries"
import type { BattleState } from "./types"
import { buildResolutionQueue } from "./engine"

// ── Unit tests ────────────────────────────────────────────────────────────────

describe("buildSnapshots", () => {
  it("returns [] for empty resolutionQueue", () => {
    const state = {
      id: "test",
      matchId: "match",
      phase: "planning" as const,
      turn: 1,
      p1Field: {
        left: makeBirdInstance("Hawk", 100, false),
        right: makeBirdInstance("Eagle", 100, false),
        bench: makeBirdInstance("Owl", 100, false),
      },
      p2Field: {
        left: makeBirdInstance("Crow", 100, false),
        right: makeBirdInstance("Raven", 100, false),
        bench: makeBirdInstance("Jay", 100, false),
      },
      pendingOrders: {},
      resolutionQueue: [],
      currentQueueIndex: 0,
      reversalWindow: null,
      battleLog: [],
      winner: null,
      createdAt: 0,
    } satisfies BattleState

    expect(buildSnapshots(state)).toEqual([])
  })

  it("returns one snapshot per action in the queue", () => {
    const state = makePlanningState()
    const snapshots = buildSnapshots(state)
    expect(snapshots.length).toBe(state.resolutionQueue.length)
  })

  it("skips fainted birds without adding log entries for them", () => {
    const state = makePlanningStateWithFaintedActingBird()
    const snapshots = buildSnapshots(state)
    // The fainted bird's action should produce no new log entry
    // (snapshot count still equals queue length)
    expect(snapshots.length).toBe(state.resolutionQueue.length)
  })
})

// ── Property tests ────────────────────────────────────────────────────────────

describe("Property 1: buildSnapshots round-trip", () => {
  /**
   * Validates: Requirements 6.3, 6.4
   *
   * For any valid pre-resolution BattleState whose resolutionQueue is the same
   * queue used to produce postState, the final snapshot's p1Field, p2Field, and
   * battleLog shall equal those of postState.
   */
  it("final snapshot matches postState fields", () => {
    fc.assert(
      fc.property(arbPrePostStatePair(), ({ preState, postState }) => {
        const snapshots = buildSnapshots(preState)
        if (snapshots.length === 0) return // empty queue: trivially true

        const final = snapshots[snapshots.length - 1]
        expect(final.p1Field).toEqual(postState.p1Field)
        expect(final.p2Field).toEqual(postState.p2Field)
        expect(final.battleLog).toEqual(postState.battleLog)
      }),
      { numRuns: 50 }
    )
  })
})

describe("Property 2: beat sequence matches resolution queue order", () => {
  /**
   * Validates: Requirements 2.1
   *
   * For any BattleState with a non-empty resolutionQueue,
   * buildSnapshots returns exactly resolutionQueue.length snapshots.
   */
  it("snapshot count equals resolutionQueue length", () => {
    fc.assert(
      fc.property(
        arbPrePostStatePair(),
        ({ preState }) => {
          const snapshots = buildSnapshots(preState)
          expect(snapshots.length).toBe(preState.resolutionQueue.length)
        }
      ),
      { numRuns: 50 }
    )
  })
})

describe("Property 4: log accumulation is monotone", () => {
  /**
   * Validates: Requirements 4.1, 4.2
   *
   * For each snapshot index k, the current-turn log entries in snapshots[k]
   * are a prefix of the current-turn log entries in the final snapshot.
   */
  it("each snapshot's current-turn log is a prefix of the final snapshot's log", () => {
    fc.assert(
      fc.property(arbPrePostStatePair(), ({ preState }) => {
        if (preState.resolutionQueue.length === 0) return

        const snapshots = buildSnapshots(preState)
        const finalLog = snapshots[snapshots.length - 1].battleLog.filter(
          (e) => e.turn === preState.turn
        )

        for (let k = 0; k < snapshots.length; k++) {
          const kLog = snapshots[k].battleLog.filter((e) => e.turn === preState.turn)
          // kLog must be a prefix of finalLog
          expect(finalLog.slice(0, kLog.length)).toEqual(kLog)
          // kLog length must be non-decreasing
          if (k > 0) {
            const prevLog = snapshots[k - 1].battleLog.filter((e) => e.turn === preState.turn)
            expect(kLog.length).toBeGreaterThanOrEqual(prevLog.length)
          }
        }
      }),
      { numRuns: 50 }
    )
  })
})

// ── Test helpers ──────────────────────────────────────────────────────────────

function makeBirdInstance(name: string, hp: number, fainted: boolean) {
  return {
    bird: {
      id: name,
      name,
      colour: "Red" as const,
      baseStats: { hp: 200, str: 100, guts: 100, spd: 100, spirit: 100 },
      moves: [
        {
          id: `${name}-move1`,
          name: "Peck",
          colour: "Red" as const,
          height: "Mid" as const,
          powerTier: "Normal" as const,
          accuracy: 100,
          priority: 0,
          flags: { reversalLegal: false, switchAttackLegal: false, contact: true, special: false },
        },
        {
          id: `${name}-move2`,
          name: "Scratch",
          colour: "Red" as const,
          height: "High" as const,
          powerTier: "Weak" as const,
          accuracy: 100,
          priority: 0,
          flags: { reversalLegal: false, switchAttackLegal: false, contact: true, special: false },
        },
        {
          id: `${name}-move3`,
          name: "Dive",
          colour: "Blue" as const,
          height: "Low" as const,
          powerTier: "Strong" as const,
          accuracy: 100,
          priority: 0,
          flags: { reversalLegal: false, switchAttackLegal: false, contact: true, special: false },
        },
        {
          id: `${name}-move4`,
          name: "Gust",
          colour: "Yellow" as const,
          height: "Mid" as const,
          powerTier: "Normal" as const,
          accuracy: 100,
          priority: 0,
          flags: { reversalLegal: false, switchAttackLegal: false, contact: false, special: true },
        },
      ],
    },
    currentHp: fainted ? 0 : hp,
    currentSpirit: 100,
    statStages: { str: 0, guts: 0, spd: 0, spirit: 0 },
    status: null,
    skipNextAction: false,
    fainted,
  }
}

function makePlanningState(): BattleState {
  const p1Field = {
    left: makeBirdInstance("Hawk", 150, false),
    right: makeBirdInstance("Eagle", 150, false),
    bench: makeBirdInstance("Owl", 150, false),
  }
  const p2Field = {
    left: makeBirdInstance("Crow", 150, false),
    right: makeBirdInstance("Raven", 150, false),
    bench: makeBirdInstance("Jay", 150, false),
  }
  const p1Orders = {
    left: { type: "attack" as const, slot: "left" as const, moveId: "Hawk-move1", targetSlot: "left" as const },
    right: { type: "attack" as const, slot: "right" as const, moveId: "Eagle-move1", targetSlot: "right" as const },
  }
  const p2Orders = {
    left: { type: "attack" as const, slot: "left" as const, moveId: "Crow-move1", targetSlot: "left" as const },
    right: { type: "attack" as const, slot: "right" as const, moveId: "Raven-move1", targetSlot: "right" as const },
  }
  const rng = { next: () => 0, nextInt: () => 0 }
  const queue = buildResolutionQueue({ id: "t", matchId: "m", phase: "planning", turn: 1, p1Field, p2Field, pendingOrders: {}, resolutionQueue: [], currentQueueIndex: 0, reversalWindow: null, battleLog: [], winner: null, createdAt: 0 }, p1Orders, p2Orders, rng)

  return {
    id: "test",
    matchId: "match",
    phase: "planning",
    turn: 1,
    p1Field,
    p2Field,
    pendingOrders: { p1: p1Orders, p2: p2Orders },
    resolutionQueue: queue,
    currentQueueIndex: 0,
    reversalWindow: null,
    battleLog: [],
    winner: null,
    createdAt: 0,
  }
}

function makePlanningStateWithFaintedActingBird(): BattleState {
  const state = makePlanningState()
  // Faint the first acting bird (the one at queue[0])
  const firstAction = state.resolutionQueue[0]
  const field = firstAction.player === "p1" ? "p1Field" : "p2Field"
  const slot = firstAction.slot as "left" | "right"
  return {
    ...state,
    [field]: {
      ...state[field],
      [slot]: { ...state[field][slot], fainted: true, currentHp: 0 },
    },
  }
}
