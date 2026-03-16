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
