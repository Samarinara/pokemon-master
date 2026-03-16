import * as fc from "fast-check"
import type {
  Colour,
  Height,
  PowerTier,
  StatusCondition,
  Move,
  Stats,
  Bird,
  Roster,
  BirdInstance,
  OrderSet,
  BattleState,
  ResolvedAction,
  Player,
  RNG,
} from "../types"

export function arbitraryColour(): fc.Arbitrary<Colour> {
  return fc.constantFrom("Red", "Yellow", "Blue", "Orange", "Purple", "Green", "Pink", "Black")
}

export function arbitraryHeight(): fc.Arbitrary<Height> {
  return fc.constantFrom("High", "Mid", "Low")
}

export function arbitraryPowerTier(): fc.Arbitrary<PowerTier> {
  return fc.constantFrom("Weak", "Normal", "Strong")
}

export function arbitraryStatusCondition(): fc.Arbitrary<StatusCondition> {
  return fc.constantFrom("Bleed", "Shaken", "Bruised")
}

export function arbitraryMove(): fc.Arbitrary<Move> {
  return fc.record({
    id: fc.uuid(),
    name: fc.string({ minLength: 1, maxLength: 20 }),
    colour: arbitraryColour(),
    height: arbitraryHeight(),
    powerTier: arbitraryPowerTier(),
    accuracy: fc.integer({ min: 10, max: 100 }),
    priority: fc.integer({ min: -2, max: 2 }),
    flags: fc.record({
      reversalLegal: fc.boolean(),
      switchAttackLegal: fc.boolean(),
      contact: fc.boolean(),
      special: fc.boolean(),
    }),
  })
}

export function arbitraryStats(): fc.Arbitrary<Stats> {
  return fc.record({
    hp: fc.integer({ min: 120, max: 220 }),
    str: fc.integer({ min: 60, max: 140 }),
    guts: fc.integer({ min: 60, max: 140 }),
    spd: fc.integer({ min: 60, max: 140 }),
    spirit: fc.integer({ min: 60, max: 140 }),
  })
}

export function arbitraryBird(): fc.Arbitrary<Bird> {
  return fc.record({
    id: fc.uuid(),
    name: fc.string({ minLength: 1, maxLength: 20 }),
    colour: arbitraryColour(),
    baseStats: arbitraryStats(),
    moves: fc.array(arbitraryMove(), { minLength: 4, maxLength: 4 }),
  })
}

export function arbitraryRoster(): fc.Arbitrary<Roster> {
  return fc.tuple(arbitraryBird(), arbitraryBird(), arbitraryBird()).map(([b1, b2, b3]) => ({
    birds: [
      { ...b1, id: b1.id },
      { ...b2, id: b2.id + "_2" },
      { ...b3, id: b3.id + "_3" },
    ] as [Bird, Bird, Bird],
  }))
}

export function arbitraryBirdInstance(): fc.Arbitrary<BirdInstance> {
  return arbitraryBird().chain((bird) =>
    fc.record({
      bird: fc.constant(bird),
      currentHp: fc.integer({ min: 0, max: 220 }),
      currentSpirit: fc.integer({ min: 0, max: 140 }),
      statStages: fc.record({
        str: fc.integer({ min: -6, max: 6 }),
        guts: fc.integer({ min: -6, max: 6 }),
        spd: fc.integer({ min: -6, max: 6 }),
        spirit: fc.integer({ min: -6, max: 6 }),
      }),
      status: fc.option(arbitraryStatusCondition(), { nil: null }),
      skipNextAction: fc.boolean(),
      fainted: fc.boolean(),
    })
  )
}

function arbitraryOrder(slotArb: fc.Arbitrary<"left" | "right">) {
  const attack = fc.record({
    type: fc.constant("attack" as const),
    slot: slotArb,
    moveId: fc.uuid(),
    targetSlot: fc.constantFrom("left" as const, "right" as const),
  })
  const block = fc.record({
    type: fc.constant("block" as const),
    slot: slotArb,
    height: fc.constantFrom("High" as const, "Low" as const),
  })
  const switchOrder = fc.record({
    type: fc.constant("switch" as const),
    slot: slotArb,
  })
  return fc.oneof(attack, block, switchOrder)
}

export function arbitraryOrderSet(): fc.Arbitrary<OrderSet> {
  return fc.record({
    left: arbitraryOrder(fc.constant("left" as const)),
    right: arbitraryOrder(fc.constant("right" as const)),
  })
}

export function arbitraryBattleState(): fc.Arbitrary<BattleState> {
  const fieldArb = fc.record({
    left: arbitraryBirdInstance(),
    right: arbitraryBirdInstance(),
    bench: arbitraryBirdInstance(),
  })

  return fc.record({
    id: fc.uuid(),
    matchId: fc.uuid(),
    phase: fc.constant("planning" as const),
    turn: fc.integer({ min: 1, max: 100 }),
    p1Field: fieldArb,
    p2Field: fieldArb,
    pendingOrders: fc.constant({}),
    resolutionQueue: fc.constant([]),
    currentQueueIndex: fc.constant(0),
    reversalWindow: fc.constant(null),
    battleLog: fc.constant([]),
    winner: fc.constant(null),
    createdAt: fc.integer({ min: 0 }),
  })
}

// ── arbPrePostStatePair ────────────────────────────────────────────────────
//
// Generates a consistent (preState, postState) pair for round-trip testing.
// Uses 100% accuracy moves so that applySingleAction (which uses roll=0)
// produces the same outcomes as resolveTurn.

import { buildResolutionQueue, resolveTurn } from "../engine"

function arbitraryMoveWith100Acc(): fc.Arbitrary<Move> {
  return fc.record({
    id: fc.string({ minLength: 4, maxLength: 8 }),
    name: fc.string({ minLength: 1, maxLength: 10 }),
    colour: arbitraryColour(),
    height: arbitraryHeight(),
    powerTier: arbitraryPowerTier(),
    accuracy: fc.constant(100),
    priority: fc.integer({ min: -1, max: 1 }),
    flags: fc.record({
      reversalLegal: fc.boolean(),
      switchAttackLegal: fc.boolean(),
      contact: fc.boolean(),
      special: fc.boolean(),
    }),
  })
}

function arbitraryBirdWith100AccMoves(): fc.Arbitrary<Bird> {
  return fc.record({
    id: fc.string({ minLength: 4, maxLength: 8 }),
    name: fc.string({ minLength: 1, maxLength: 10 }),
    colour: arbitraryColour(),
    baseStats: arbitraryStats(),
    moves: fc.array(arbitraryMoveWith100Acc(), { minLength: 4, maxLength: 4 }),
  })
}

function arbitraryLiveBirdInstance(): fc.Arbitrary<BirdInstance> {
  return arbitraryBirdWith100AccMoves().chain((bird) =>
    fc.record({
      bird: fc.constant(bird),
      currentHp: fc.integer({ min: 10, max: 220 }),
      currentSpirit: fc.integer({ min: 0, max: 140 }),
      statStages: fc.record({
        str: fc.integer({ min: -6, max: 6 }),
        guts: fc.integer({ min: -6, max: 6 }),
        spd: fc.integer({ min: -6, max: 6 }),
        spirit: fc.integer({ min: -6, max: 6 }),
      }),
      status: fc.option(arbitraryStatusCondition(), { nil: null }),
      skipNextAction: fc.constant(false),
      fainted: fc.constant(false),
    })
  )
}

// Seeded deterministic RNG (always returns 0) — matches roll=0 in applySingleAction
function deterministicRng(): RNG {
  return { next: () => 0, nextInt: () => 0 }
}

export function arbPrePostStatePair(): fc.Arbitrary<{ preState: BattleState; postState: BattleState }> {
  const fieldArb = fc.record({
    left: arbitraryLiveBirdInstance(),
    right: arbitraryLiveBirdInstance(),
    bench: arbitraryLiveBirdInstance(),
  })

  return fc
    .record({
      id: fc.string({ minLength: 4, maxLength: 8 }),
      matchId: fc.string({ minLength: 4, maxLength: 8 }),
      turn: fc.integer({ min: 1, max: 10 }),
      p1Field: fieldArb,
      p2Field: fieldArb,
      createdAt: fc.integer({ min: 0 }),
    })
    .map(({ id, matchId, turn, p1Field, p2Field, createdAt }) => {
      // Build order sets that reference actual move IDs from the birds
      const p1Orders: OrderSet = {
        left: { type: "attack", slot: "left", moveId: p1Field.left.bird.moves[0].id, targetSlot: "left" },
        right: { type: "attack", slot: "right", moveId: p1Field.right.bird.moves[0].id, targetSlot: "right" },
      }
      const p2Orders: OrderSet = {
        left: { type: "attack", slot: "left", moveId: p2Field.left.bird.moves[0].id, targetSlot: "left" },
        right: { type: "attack", slot: "right", moveId: p2Field.right.bird.moves[0].id, targetSlot: "right" },
      }

      const baseState: BattleState = {
        id,
        matchId,
        phase: "planning",
        turn,
        p1Field,
        p2Field,
        pendingOrders: { p1: p1Orders, p2: p2Orders },
        resolutionQueue: [],
        currentQueueIndex: 0,
        reversalWindow: null,
        battleLog: [],
        winner: null,
        createdAt,
      }

      // Build queue with deterministic RNG (tiebreakers all 0)
      const rng = deterministicRng()
      const queue = buildResolutionQueue(baseState, p1Orders, p2Orders, rng)

      const preState: BattleState = {
        ...baseState,
        resolutionQueue: queue,
        currentQueueIndex: 0,
        phase: "planning",
      }

      // resolveTurn with same deterministic RNG (fresh instance)
      const rng2 = deterministicRng()
      const postState = resolveTurn(preState, p1Orders, p2Orders, rng2)

      return { preState, postState }
    })
}

// ── Matchmaking arbitraries ────────────────────────────────────────────────

import type { Session } from "../matchmaking/types"

export function arbitraryDisplayName(): fc.Arbitrary<string> {
  return fc.stringMatching(/^[a-zA-Z0-9]{1,24}$/)
}

export function arbitraryJoinCode(): fc.Arbitrary<string> {
  return fc.stringMatching(/^[A-Z0-9]{1,16}$/)
}

export function arbitraryInvalidDisplayName(): fc.Arbitrary<string> {
  return fc.oneof(
    fc.constant(""),
    fc.stringMatching(/^[a-zA-Z0-9]{25,50}$/)
  )
}

export function arbitraryInvalidJoinCode(): fc.Arbitrary<string> {
  return fc.oneof(
    fc.constant(""),
    fc.stringMatching(/^[A-Z0-9]{17,32}$/),
    fc.stringMatching(/^[A-Z0-9]{1,8}[^A-Z0-9]+[A-Z0-9]{0,8}$/)
  )
}

export function arbitrarySession(): fc.Arbitrary<Session> {
  const lobbyStates = ["waiting", "pending_acceptance", "in_progress", "complete"] as const

  return fc.constantFrom(...lobbyStates).chain((lobbyState) => {
    const now = Date.now()

    const sessionPlayerArb = arbitraryDisplayName().map((displayName) => ({
      displayName,
      token: crypto.randomUUID(),
      player: null,
      connectedAt: 0,
    }))

    return fc.record({
      joinCode: arbitraryJoinCode(),
      lobbyState: fc.constant(lobbyState),
      host: sessionPlayerArb,
      joiner: lobbyState === "waiting"
        ? fc.constant(null)
        : sessionPlayerArb,
      battleId: lobbyState === "in_progress" ? fc.uuid() : fc.constant(null),
      createdAt: fc.constant(now),
      updatedAt: fc.constant(now),
      acceptanceDeadline: lobbyState === "pending_acceptance"
        ? fc.constant(now + 30000)
        : fc.constant(null),
    })
  })
}
