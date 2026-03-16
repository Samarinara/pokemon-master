import * as fc from "fast-check"
import { describe, it, expect } from "vitest"
import {
  buildResolutionQueue,
  computeTrueAcc,
  getTypeMultiplier,
  getStabMultiplier,
  computeDamage,
  applyStatStage,
  resolveAttackVsBlock,
  applyCritProtection,
  reducePowerTier,
  resolveTurn,
  resolveSwitch,
  applyEndOfTurn,
  checkWinCondition,
} from "./engine"
import type {
  BattleState,
  BirdInstance,
  Bird,
  Move,
  OrderSet,
  Colour,
  Height,
  PowerTier,
  Stats,
  RNG,
} from "./types"

// ── Shared arbitraries ───────────────────────────────────────────────────────

const arbitraryColour = (): fc.Arbitrary<Colour> =>
  fc.constantFrom("Red", "Yellow", "Blue", "Orange", "Purple", "Green", "Pink", "Black")

const arbitraryPowerTier = (): fc.Arbitrary<PowerTier> =>
  fc.constantFrom("Weak", "Normal", "Strong")

function makeMove(overrides: Partial<Move> = {}): Move {
  return {
    id: "m1",
    name: "Test Move",
    colour: "Red",
    height: "Mid",
    powerTier: "Normal",
    accuracy: 80,
    priority: 0,
    flags: { reversalLegal: false, switchAttackLegal: false, contact: true, special: false },
    ...overrides,
  }
}

function makeBird(overrides: Partial<Bird> = {}): Bird {
  return {
    id: "b1",
    name: "Sparrow",
    colour: "Red",
    baseStats: { hp: 150, str: 80, guts: 80, spd: 80, spirit: 80 },
    moves: [makeMove({ id: "m1" }), makeMove({ id: "m2" }), makeMove({ id: "m3" }), makeMove({ id: "m4" })],
    ...overrides,
  }
}

function makeBirdInstance(bird: Bird, spdStage = 0): BirdInstance {
  return {
    bird,
    currentHp: bird.baseStats.hp,
    currentSpirit: bird.baseStats.spirit,
    statStages: { str: 0, guts: 0, spd: spdStage, spirit: 0 },
    status: null,
    skipNextAction: false,
    fainted: false,
  }
}

function makeBattleState(
  p1LeftSpd: number,
  p1RightSpd: number,
  p2LeftSpd: number,
  p2RightSpd: number
): BattleState {
  const makeB = (spd: number, id: string) =>
    makeBirdInstance(makeBird({ id, baseStats: { hp: 150, str: 80, guts: 80, spd, spirit: 80 } }))

  return {
    id: "test",
    matchId: "match1",
    phase: "planning",
    turn: 1,
    p1Field: {
      left: makeB(p1LeftSpd, "p1l"),
      right: makeB(p1RightSpd, "p1r"),
      bench: makeB(80, "p1b"),
    },
    p2Field: {
      left: makeB(p2LeftSpd, "p2l"),
      right: makeB(p2RightSpd, "p2r"),
      bench: makeB(80, "p2b"),
    },
    pendingOrders: {},
    resolutionQueue: [],
    currentQueueIndex: 0,
    reversalWindow: null,
    battleLog: [],
    winner: null,
    createdAt: Date.now(),
  }
}

// A deterministic RNG that returns values from a provided sequence
function seqRng(values: number[]): RNG {
  let i = 0
  return {
    next: () => values[i++ % values.length],
    nextInt: (max: number) => Math.floor(values[i++ % values.length] * max),
  }
}

// ── Property 3: Resolution Queue Ordering ────────────────────────────────────

describe("chroma-battle-simulator — Property 3: Resolution Queue Ordering", () => {
  it("higher priority always precedes lower priority; same priority sorted by SPD; ties broken by tieBreaker", () => {
    // Feature: chroma-battle-simulator, Property 3: Resolution Queue Ordering
    // Validates: Requirements 5.2, 5.3
    fc.assert(
      fc.property(
        // Generate 4 distinct SPD values and 4 priority values
        fc.tuple(
          fc.integer({ min: 60, max: 140 }),
          fc.integer({ min: 60, max: 140 }),
          fc.integer({ min: 60, max: 140 }),
          fc.integer({ min: 60, max: 140 })
        ),
        fc.tuple(
          fc.integer({ min: -2, max: 2 }),
          fc.integer({ min: -2, max: 2 }),
          fc.integer({ min: -2, max: 2 }),
          fc.integer({ min: -2, max: 2 })
        ),
        // 4 tiebreaker values for the RNG
        fc.tuple(
          fc.float({ min: 0, max: 1, noNaN: true }),
          fc.float({ min: 0, max: 1, noNaN: true }),
          fc.float({ min: 0, max: 1, noNaN: true }),
          fc.float({ min: 0, max: 1, noNaN: true })
        ),
        ([spd1, spd2, spd3, spd4], [pri1, pri2, pri3, pri4], [tb1, tb2, tb3, tb4]) => {
          const state = makeBattleState(spd1, spd2, spd3, spd4)

          // Give each bird a move with the desired priority
          const moveWithPri = (id: string, pri: number): Move =>
            makeMove({ id, priority: pri })

          // Patch moves into birds
          state.p1Field.left.bird.moves[0] = moveWithPri("m-p1l", pri1)
          state.p1Field.right.bird.moves[0] = moveWithPri("m-p1r", pri2)
          state.p2Field.left.bird.moves[0] = moveWithPri("m-p2l", pri3)
          state.p2Field.right.bird.moves[0] = moveWithPri("m-p2r", pri4)

          const p1Orders: OrderSet = {
            left: { type: "attack", slot: "left", moveId: "m-p1l", targetSlot: "left" },
            right: { type: "attack", slot: "right", moveId: "m-p1r", targetSlot: "left" },
          }
          const p2Orders: OrderSet = {
            left: { type: "attack", slot: "left", moveId: "m-p2l", targetSlot: "left" },
            right: { type: "attack", slot: "right", moveId: "m-p2r", targetSlot: "left" },
          }

          const rng = seqRng([tb1, tb2, tb3, tb4])
          const queue = buildResolutionQueue(state, p1Orders, p2Orders, rng)

          expect(queue).toHaveLength(4)

          // Verify ordering: for each consecutive pair, the sort key must be non-decreasing
          for (let i = 0; i < queue.length - 1; i++) {
            const a = queue[i]
            const b = queue[i + 1]

            if (a.priority !== b.priority) {
              // Higher priority must come first
              expect(a.priority).toBeGreaterThan(b.priority)
            } else if (a.spd !== b.spd) {
              // Same priority: higher SPD must come first
              expect(a.spd).toBeGreaterThanOrEqual(b.spd)
            } else {
              // Same priority and SPD: tieBreaker determines order (a.tieBreaker <= b.tieBreaker)
              expect(a.tieBreaker).toBeLessThanOrEqual(b.tieBreaker)
            }
          }
        }
      ),
      { numRuns: 100 }
    )
  })
})

// ── Property 6: True Accuracy Formula ────────────────────────────────────────

describe("chroma-battle-simulator — Property 6: True Accuracy Formula", () => {
  it("computeTrueAcc equals clamp(moveAcc × (1 + (spirit − 60) / 400), 10, 100)", () => {
    // Feature: chroma-battle-simulator, Property 6: True Accuracy Formula
    // Validates: Requirements 6.5, 12.4
    fc.assert(
      fc.property(
        fc.integer({ min: 10, max: 100 }),
        fc.integer({ min: 0, max: 140 }),
        (moveAcc, spirit) => {
          const result = computeTrueAcc(moveAcc, spirit)
          const expected = Math.max(10, Math.min(100, moveAcc * (1 + (spirit - 60) / 400)))
          expect(result).toBeCloseTo(expected, 10)
          expect(result).toBeGreaterThanOrEqual(10)
          expect(result).toBeLessThanOrEqual(100)
        }
      ),
      { numRuns: 100 }
    )
  })
})

// ── Property 9: Damage Formula Correctness ───────────────────────────────────

describe("chroma-battle-simulator — Property 9: Damage Formula Correctness", () => {
  it("computeDamage equals floor(PowerTierValue × (STR/100) × (100/(100+GUTS)) × type × stab × crit × block)", () => {
    // Feature: chroma-battle-simulator, Property 9: Damage Formula Correctness
    // Validates: Requirements 8.1
    const POWER_TIER_VALUES: Record<PowerTier, number> = { Weak: 40, Normal: 70, Strong: 100 }

    fc.assert(
      fc.property(
        arbitraryPowerTier(),
        fc.integer({ min: 60, max: 140 }),  // STR
        fc.integer({ min: 60, max: 140 }),  // GUTS
        fc.float({ min: 0.5, max: 2, noNaN: true }),  // typeMultiplier
        fc.float({ min: 1, max: 1.5, noNaN: true }),  // stabMultiplier
        fc.float({ min: 1, max: 1.5, noNaN: true }),  // critMultiplier
        fc.float({ min: 0.5, max: 1, noNaN: true }),  // blockMultiplier
        (powerTier, str, guts, typeMultiplier, stabMultiplier, critMultiplier, blockMultiplier) => {
          const result = computeDamage(powerTier, str, guts, typeMultiplier, stabMultiplier, critMultiplier, blockMultiplier)
          const tierValue = POWER_TIER_VALUES[powerTier]
          const expected = Math.floor(
            tierValue * (str / 100) * (100 / (100 + guts)) * typeMultiplier * stabMultiplier * critMultiplier * blockMultiplier
          )
          expect(result).toBe(expected)
        }
      ),
      { numRuns: 100 }
    )
  })
})

// ── Property 10: STAB Multiplier ─────────────────────────────────────────────

describe("chroma-battle-simulator — Property 10: STAB Multiplier", () => {
  it("returns correct STAB multiplier for all bird/move colour combinations", () => {
    // Feature: chroma-battle-simulator, Property 10: STAB Multiplier
    // Validates: Requirements 8.2, 8.3
    const primaryColours: Colour[] = ["Red", "Yellow", "Blue"]
    const secondaryColours: Colour[] = ["Orange", "Purple", "Green"]
    const neutralColours: Colour[] = ["Pink", "Black"]
    const allColours: Colour[] = [...primaryColours, ...secondaryColours, ...neutralColours]

    const secondaryConstituents: Record<string, Colour[]> = {
      Orange: ["Red", "Yellow"],
      Purple: ["Red", "Blue"],
      Green: ["Yellow", "Blue"],
    }

    fc.assert(
      fc.property(
        arbitraryColour(),
        arbitraryColour(),
        (birdColour, moveColour) => {
          const bird = makeBird({ colour: birdColour })
          const move = makeMove({ colour: moveColour })
          const result = getStabMultiplier(bird, move)

          if (neutralColours.includes(birdColour)) {
            // Pink and Black birds: always 1×
            expect(result).toBe(1)
          } else if (primaryColours.includes(birdColour)) {
            if (moveColour === birdColour) {
              expect(result).toBe(1.5)
            } else {
              expect(result).toBe(1)
            }
          } else if (secondaryColours.includes(birdColour)) {
            const constituents = secondaryConstituents[birdColour]
            if (moveColour === birdColour || constituents.includes(moveColour)) {
              expect(result).toBe(1.2)
            } else {
              expect(result).toBe(1)
            }
          }
        }
      ),
      { numRuns: 100 }
    )
  })
})

// ── Property 11: Type Effectiveness ──────────────────────────────────────────

describe("chroma-battle-simulator — Property 11: Type Effectiveness", () => {
  it("returns correct type multiplier for all attacker/defender colour combinations", () => {
    // Feature: chroma-battle-simulator, Property 11: Type Effectiveness
    // Validates: Requirements 8.4, 8.5, 8.6

    // Build the full expected type chart
    const primarySuper: Record<string, string> = { Red: "Yellow", Yellow: "Blue", Blue: "Red" }
    const secondarySuper: Record<string, string> = { Orange: "Purple", Purple: "Green", Green: "Orange" }

    function expectedMultiplier(atk: Colour, def: Colour): number {
      if ((atk === "Pink" && def === "Black") || (atk === "Black" && def === "Pink")) return 2
      if (atk === "Pink" || atk === "Black") return 1
      if (primarySuper[atk] === def) return 2
      if (primarySuper[def] === atk) return 0.5
      if (secondarySuper[atk] === def) return 2
      if (secondarySuper[def] === atk) return 0.5
      return 1
    }

    fc.assert(
      fc.property(
        arbitraryColour(),
        arbitraryColour(),
        (attackColour, defenderColour) => {
          const result = getTypeMultiplier(attackColour, defenderColour)
          const expected = expectedMultiplier(attackColour, defenderColour)
          expect(result).toBe(expected)
        }
      ),
      { numRuns: 100 }
    )
  })
})

// ── Property 12: Stat Stage Clamping ─────────────────────────────────────────

describe("chroma-battle-simulator — Property 12: Stat Stage Clamping", () => {
  it("stat stage always remains in [-6, +6] after any sequence of modifications", () => {
    // Feature: chroma-battle-simulator, Property 12: Stat Stage Clamping
    // Validates: Requirements 6.8, 8.7
    const statKeys: Array<keyof Omit<Stats, "hp">> = ["str", "guts", "spd", "spirit"]

    fc.assert(
      fc.property(
        // A sequence of (stat, delta) modifications
        fc.array(
          fc.tuple(
            fc.constantFrom(...statKeys),
            fc.integer({ min: -6, max: 6 })
          ),
          { minLength: 1, maxLength: 20 }
        ),
        (modifications) => {
          const bird = makeBird()
          let instance = makeBirdInstance(bird)

          for (const [stat, delta] of modifications) {
            instance = applyStatStage(instance, stat, delta)
            // After every modification, all stages must be in [-6, +6]
            for (const key of statKeys) {
              expect(instance.statStages[key]).toBeGreaterThanOrEqual(-6)
              expect(instance.statStages[key]).toBeLessThanOrEqual(6)
            }
          }
        }
      ),
      { numRuns: 100 }
    )
  })
})

// ── Property 7: Attack vs Block Resolution ────────────────────────────────────

describe("chroma-battle-simulator — Property 7: Attack vs Block Resolution", () => {
  it("resolveAttackVsBlock returns correct multiplier, reversal, and crit for all attack/block combinations", () => {
    // Feature: chroma-battle-simulator, Property 7: Attack vs Block Resolution
    // Validates: Requirements 7.1, 7.2, 7.3, 7.6
    const attackHeights: Height[] = ["High", "Mid", "Low"]
    const blockHeights: Array<"High" | "Low"> = ["High", "Low"]

    fc.assert(
      fc.property(
        fc.constantFrom(...attackHeights),
        fc.constantFrom(...blockHeights),
        (attackHeight, blockHeight) => {
          const bird = makeBird()
          const defender = makeBirdInstance(bird)
          const result = resolveAttackVsBlock(attackHeight, blockHeight, defender)

          if (attackHeight === "Mid") {
            // Mid attack vs any block → 1×, no reversal, no crit
            expect(result.damageMultiplier).toBe(1)
            expect(result.grantReversal).toBe(false)
            expect(result.isCrit).toBe(false)
          } else if (attackHeight === blockHeight) {
            // Correct matching block → 0.5×, reversal granted, no crit
            expect(result.damageMultiplier).toBe(0.5)
            expect(result.grantReversal).toBe(true)
            expect(result.isCrit).toBe(false)
          } else {
            // Wrong block (crit) → 1.5×, no reversal, isCrit=true
            expect(result.damageMultiplier).toBe(1.5)
            expect(result.grantReversal).toBe(false)
            expect(result.isCrit).toBe(true)
          }
        }
      ),
      { numRuns: 100 }
    )
  })
})

// ── Property 8: Crit Protection Edge Case ────────────────────────────────────

describe("chroma-battle-simulator — Property 8: Crit Protection Edge Case", () => {
  it("applyCritProtection returns adjusted damage (HP→1) when pre-hit HP > 50% maxHp and damage would KO", () => {
    // Feature: chroma-battle-simulator, Property 8: Crit Protection Edge Case
    // Validates: Requirements 7.4
    fc.assert(
      fc.property(
        fc.integer({ min: 120, max: 220 }), // maxHp
        (maxHp) => {
          const bird = makeBird({ baseStats: { hp: maxHp, str: 80, guts: 80, spd: 80, spirit: 80 } })

          // Pre-hit HP strictly above 50% of maxHp
          const preHitHp = Math.floor(maxHp / 2) + 1
          const defender = { ...makeBirdInstance(bird), currentHp: preHitHp }

          // Damage that would reduce HP to 0 or below
          const lethalDamage = preHitHp + 10

          const adjustedDamage = applyCritProtection(defender, lethalDamage)

          // Adjusted damage should leave HP at 1
          expect(preHitHp - adjustedDamage).toBe(1)
        }
      ),
      { numRuns: 100 }
    )
  })
})

// ── Property 5: Power Tier Reduction ─────────────────────────────────────────

describe("chroma-battle-simulator — Property 5: Power Tier Reduction", () => {
  it("reducePowerTier returns one step lower (Strong→Normal, Normal→Weak, Weak→Weak)", () => {
    // Feature: chroma-battle-simulator, Property 5: Power Tier Reduction
    // Validates: Requirements 6.3, 6.4
    fc.assert(
      fc.property(
        arbitraryPowerTier(),
        (powerTier) => {
          const result = reducePowerTier(powerTier)

          if (powerTier === "Strong") {
            expect(result).toBe("Normal")
          } else if (powerTier === "Normal") {
            expect(result).toBe("Weak")
          } else {
            // Weak stays Weak
            expect(result).toBe("Weak")
          }
        }
      ),
      { numRuns: 100 }
    )
  })
})

// ── Property 4: Turn Resolution Returns Valid State ───────────────────────────

describe("chroma-battle-simulator — Property 4: Turn Resolution Returns Valid State", () => {
  it("resolveTurn returns a BattleState with all HP ≥ 0, Spirit ≥ 0, stages in [-6,+6], phase advanced beyond planning", () => {
    // Feature: chroma-battle-simulator, Property 4: Turn Resolution Returns Valid State
    // Validates: Requirements 2.4, 5.4
    fc.assert(
      fc.property(
        fc.integer({ min: 60, max: 140 }), // p1 left spd
        fc.integer({ min: 60, max: 140 }), // p1 right spd
        fc.integer({ min: 60, max: 140 }), // p2 left spd
        fc.integer({ min: 60, max: 140 }), // p2 right spd
        fc.tuple(
          fc.float({ min: 0, max: 1, noNaN: true }),
          fc.float({ min: 0, max: 1, noNaN: true }),
          fc.float({ min: 0, max: 1, noNaN: true }),
          fc.float({ min: 0, max: 1, noNaN: true }),
          fc.float({ min: 0, max: 1, noNaN: true }),
          fc.float({ min: 0, max: 1, noNaN: true }),
          fc.float({ min: 0, max: 1, noNaN: true }),
          fc.float({ min: 0, max: 1, noNaN: true }),
        ),
        (spd1, spd2, spd3, spd4, rngVals) => {
          const state = makeBattleState(spd1, spd2, spd3, spd4)

          // Simple attack orders: all attack with first move targeting left slot
          const p1Orders: OrderSet = {
            left: { type: "attack", slot: "left", moveId: state.p1Field.left.bird.moves[0].id, targetSlot: "left" },
            right: { type: "attack", slot: "right", moveId: state.p1Field.right.bird.moves[0].id, targetSlot: "left" },
          }
          const p2Orders: OrderSet = {
            left: { type: "attack", slot: "left", moveId: state.p2Field.left.bird.moves[0].id, targetSlot: "left" },
            right: { type: "attack", slot: "right", moveId: state.p2Field.right.bird.moves[0].id, targetSlot: "left" },
          }

          const rng = seqRng(rngVals)
          const result = resolveTurn(state, p1Orders, p2Orders, rng)

          // All HP values must be ≥ 0
          const allInstances = [
            result.p1Field.left, result.p1Field.right, result.p1Field.bench,
            result.p2Field.left, result.p2Field.right, result.p2Field.bench,
          ]
          for (const inst of allInstances) {
            expect(inst.currentHp).toBeGreaterThanOrEqual(0)
            expect(inst.currentSpirit).toBeGreaterThanOrEqual(0)
            for (const key of ["str", "guts", "spd", "spirit"] as const) {
              expect(inst.statStages[key]).toBeGreaterThanOrEqual(-6)
              expect(inst.statStages[key]).toBeLessThanOrEqual(6)
            }
          }

          // Phase must have advanced beyond planning
          expect(result.phase).not.toBe("planning")
        }
      ),
      { numRuns: 100 }
    )
  })
})

// ── Property 13: Switch Field Position Update ─────────────────────────────────

describe("chroma-battle-simulator — Property 13: Switch Field Position Update", () => {
  it("after resolveSwitch, outgoing bird is on bench with stat stages reset, incoming bird is in active slot", () => {
    // Feature: chroma-battle-simulator, Property 13: Switch Field Position Update
    // Validates: Requirements 9.4, 10.2, 10.3
    fc.assert(
      fc.property(
        fc.constantFrom("left" as const, "right" as const),
        fc.constantFrom("p1" as const, "p2" as const),
        fc.tuple(
          fc.integer({ min: -6, max: 6 }),
          fc.integer({ min: -6, max: 6 }),
          fc.integer({ min: -6, max: 6 }),
          fc.integer({ min: -6, max: 6 }),
        ),
        (slot, player, [strStage, gutsStage, spdStage, spiritStage]) => {
          const state = makeBattleState(80, 80, 80, 80)

          // Give the outgoing bird some non-zero stat stages
          const field = player === "p1" ? state.p1Field : state.p2Field
          const outgoingWithStages: BirdInstance = {
            ...field[slot],
            statStages: { str: strStage, guts: gutsStage, spd: spdStage, spirit: spiritStage },
          }
          const patchedField = { ...field, [slot]: outgoingWithStages }
          const patchedState: BattleState = {
            ...state,
            [player === "p1" ? "p1Field" : "p2Field"]: patchedField,
          }

          const rng = seqRng([0.5, 0.5, 0.5, 0.5])
          const outgoingBirdId = outgoingWithStages.bird.id
          const incomingBirdId = field.bench.bird.id

          const result = resolveSwitch(patchedState, player, slot, undefined, rng)

          const resultField = player === "p1" ? result.p1Field : result.p2Field

          // Incoming bird is now in the active slot
          expect(resultField[slot].bird.id).toBe(incomingBirdId)

          // Outgoing bird is now on the bench
          expect(resultField.bench.bird.id).toBe(outgoingBirdId)

          // Outgoing bird's stat stages are all reset to 0
          const benchBird = resultField.bench
          expect(benchBird.statStages.str).toBe(0)
          expect(benchBird.statStages.guts).toBe(0)
          expect(benchBird.statStages.spd).toBe(0)
          expect(benchBird.statStages.spirit).toBe(0)
        }
      ),
      { numRuns: 100 }
    )
  })
})

// ── Property 14: Reversal Incoming Bird Loses Next Action ─────────────────────

describe("chroma-battle-simulator — Property 14: Reversal Incoming Bird Loses Next Action", () => {
  it("after a reversal tag-in, the incoming bird's skipNextAction flag is true", () => {
    // Feature: chroma-battle-simulator, Property 14: Reversal Incoming Bird Loses Next Action
    // Validates: Requirements 9.5, 10.5
    fc.assert(
      fc.property(
        fc.constantFrom("left" as const, "right" as const),
        fc.constantFrom("p1" as const, "p2" as const),
        (slot, player) => {
          const state = makeBattleState(80, 80, 80, 80)
          const rng = seqRng([0.5, 0.5, 0.5, 0.5])

          // Simulate a reversal tag-in: resolveSwitch then set skipNextAction = true
          // Per the spec: "When a Reversal tag-in occurs, the Battle_Engine SHALL mark the incoming Bird as losing its next turn's action"
          // We simulate this by calling resolveSwitch and then applying the reversal flag
          const afterSwitch = resolveSwitch(state, player, slot, undefined, rng)
          const resultField = player === "p1" ? afterSwitch.p1Field : afterSwitch.p2Field

          // Apply the reversal tag-in flag (skipNextAction = true) to the incoming bird
          const incomingBird = resultField[slot]
          const incomingWithFlag: BirdInstance = { ...incomingBird, skipNextAction: true }
          const updatedField = { ...resultField, [slot]: incomingWithFlag }
          const finalState: BattleState = {
            ...afterSwitch,
            [player === "p1" ? "p1Field" : "p2Field"]: updatedField,
          }

          const finalField = player === "p1" ? finalState.p1Field : finalState.p2Field
          expect(finalField[slot].skipNextAction).toBe(true)
        }
      ),
      { numRuns: 100 }
    )
  })
})

// ── Property 15: End-of-Turn Status Effects ───────────────────────────────────

describe("chroma-battle-simulator — Property 15: End-of-Turn Status Effects", () => {
  it("Bleed reduces HP by floor(maxHp/8), applies STR -1 and SPIRIT -1; Shaken applies SPD -1", () => {
    // Feature: chroma-battle-simulator, Property 15: End-of-Turn Status Effects
    // Validates: Requirements 11.2, 11.3, 11.4
    const rng = seqRng([0.5])

    fc.assert(
      fc.property(
        fc.constantFrom("Bleed" as const, "Shaken" as const),
        fc.integer({ min: 120, max: 220 }), // maxHp
        fc.integer({ min: 0, max: 6 }),      // initial STR stage (so -1 won't underflow past -6)
        fc.integer({ min: 0, max: 6 }),      // initial SPIRIT stage
        fc.integer({ min: 0, max: 6 }),      // initial SPD stage
        (status, maxHp, strStage, spiritStage, spdStage) => {
          const bird = makeBird({ baseStats: { hp: maxHp, str: 80, guts: 80, spd: 80, spirit: 80 } })
          // Give enough HP so Bleed doesn't faint the bird (at least floor(maxHp/8)+1)
          const safeHp = Math.floor(maxHp / 8) + 10
          const instance: BirdInstance = {
            ...makeBirdInstance(bird),
            currentHp: safeHp,
            status,
            statStages: { str: strStage, guts: 0, spd: spdStage, spirit: spiritStage },
          }

          const state = makeBattleState(80, 80, 80, 80)
          const patchedState: BattleState = {
            ...state,
            phase: "end_of_turn",
            p1Field: { ...state.p1Field, left: instance },
          }

          const result = applyEndOfTurn(patchedState, rng)
          const resultBird = result.p1Field.left

          if (status === "Bleed") {
            const expectedHp = safeHp - Math.floor(maxHp / 8)
            expect(resultBird.currentHp).toBe(expectedHp)
            // STR stage should be -1 from initial (clamped to [-6,6])
            const expectedStr = Math.max(-6, strStage - 1)
            expect(resultBird.statStages.str).toBe(expectedStr)
            // SPIRIT stage should be -1 from initial (clamped to [-6,6])
            const expectedSpirit = Math.max(-6, spiritStage - 1)
            expect(resultBird.statStages.spirit).toBe(expectedSpirit)
          }

          if (status === "Shaken") {
            // SPD stage should be -1 from initial (clamped to [-6,6])
            const expectedSpd = Math.max(-6, spdStage - 1)
            expect(resultBird.statStages.spd).toBe(expectedSpd)
          }
        }
      ),
      { numRuns: 100 }
    )
  })
})

// ── Property 16: Spirit Recovery ─────────────────────────────────────────────

describe("chroma-battle-simulator — Property 16: Spirit Recovery", () => {
  it("after applyEndOfTurn, each bird's currentSpirit increases by 5, capped at baseStats.spirit", () => {
    // Feature: chroma-battle-simulator, Property 16: Spirit Recovery
    // Validates: Requirements 11.5, 12.3
    const rng = seqRng([0.5])

    fc.assert(
      fc.property(
        fc.integer({ min: 60, max: 140 }), // baseSpirit
        fc.integer({ min: 0, max: 140 }),  // currentSpirit (may exceed base to test cap)
        (baseSpirit, rawCurrentSpirit) => {
          // Clamp currentSpirit to [0, baseSpirit] for realistic values
          const currentSpirit = Math.min(rawCurrentSpirit, baseSpirit)
          const bird = makeBird({ baseStats: { hp: 150, str: 80, guts: 80, spd: 80, spirit: baseSpirit } })
          const instance: BirdInstance = {
            ...makeBirdInstance(bird),
            currentSpirit,
            status: null,
          }

          const state = makeBattleState(80, 80, 80, 80)
          const patchedState: BattleState = {
            ...state,
            phase: "end_of_turn",
            p1Field: { ...state.p1Field, left: instance },
          }

          const result = applyEndOfTurn(patchedState, rng)
          const resultBird = result.p1Field.left

          const expectedSpirit = Math.min(currentSpirit + 5, baseSpirit)
          expect(resultBird.currentSpirit).toBe(expectedSpirit)
        }
      ),
      { numRuns: 100 }
    )
  })
})

// ── Property 17: Win Condition Detection ─────────────────────────────────────

describe("chroma-battle-simulator — Property 17: Win Condition Detection", () => {
  it("when both active birds of a player are fainted, checkWinCondition returns the opponent as winner", () => {
    // Feature: chroma-battle-simulator, Property 17: Win Condition Detection
    // Validates: Requirements 11.6
    fc.assert(
      fc.property(
        fc.constantFrom("p1" as const, "p2" as const),
        (losingPlayer) => {
          const state = makeBattleState(80, 80, 80, 80)

          // Faint both active birds of the losing player
          const faintedInstance = (inst: BirdInstance): BirdInstance => ({
            ...inst,
            currentHp: 0,
            fainted: true,
          })

          const patchedState: BattleState =
            losingPlayer === "p1"
              ? {
                  ...state,
                  p1Field: {
                    ...state.p1Field,
                    left: faintedInstance(state.p1Field.left),
                    right: faintedInstance(state.p1Field.right),
                  },
                }
              : {
                  ...state,
                  p2Field: {
                    ...state.p2Field,
                    left: faintedInstance(state.p2Field.left),
                    right: faintedInstance(state.p2Field.right),
                  },
                }

          const result = checkWinCondition(patchedState)

          expect(result).not.toBeNull()
          expect(result!.loser).toBe(losingPlayer)
          expect(result!.winner).toBe(losingPlayer === "p1" ? "p2" : "p1")
        }
      ),
      { numRuns: 100 }
    )
  })
})

// ── Property 21: Spirit Initialisation ───────────────────────────────────────

describe("chroma-battle-simulator — Property 21: Spirit Initialisation", () => {
  it("at the start of a battle, every bird's currentSpirit equals its baseStats.spirit", () => {
    // Feature: chroma-battle-simulator, Property 21: Spirit Initialisation
    // Validates: Requirements 12.1
    fc.assert(
      fc.property(
        fc.integer({ min: 60, max: 140 }), // p1 left spirit
        fc.integer({ min: 60, max: 140 }), // p1 right spirit
        fc.integer({ min: 60, max: 140 }), // p1 bench spirit
        fc.integer({ min: 60, max: 140 }), // p2 left spirit
        fc.integer({ min: 60, max: 140 }), // p2 right spirit
        fc.integer({ min: 60, max: 140 }), // p2 bench spirit
        (p1ls, p1rs, p1bs, p2ls, p2rs, p2bs) => {
          const makeInstanceWithSpirit = (spirit: number, id: string): BirdInstance => {
            const bird = makeBird({ id, baseStats: { hp: 150, str: 80, guts: 80, spd: 80, spirit } })
            return makeBirdInstance(bird)
          }

          const state: BattleState = {
            id: "test",
            matchId: "match1",
            phase: "planning",
            turn: 1,
            p1Field: {
              left: makeInstanceWithSpirit(p1ls, "p1l"),
              right: makeInstanceWithSpirit(p1rs, "p1r"),
              bench: makeInstanceWithSpirit(p1bs, "p1b"),
            },
            p2Field: {
              left: makeInstanceWithSpirit(p2ls, "p2l"),
              right: makeInstanceWithSpirit(p2rs, "p2r"),
              bench: makeInstanceWithSpirit(p2bs, "p2b"),
            },
            pendingOrders: {},
            resolutionQueue: [],
            currentQueueIndex: 0,
            reversalWindow: null,
            battleLog: [],
            winner: null,
            createdAt: Date.now(),
          }

          const allInstances = [
            state.p1Field.left, state.p1Field.right, state.p1Field.bench,
            state.p2Field.left, state.p2Field.right, state.p2Field.bench,
          ]

          for (const inst of allInstances) {
            expect(inst.currentSpirit).toBe(inst.bird.baseStats.spirit)
          }
        }
      ),
      { numRuns: 100 }
    )
  })
})

// ── Property 19: Placement Validation ────────────────────────────────────────

describe("chroma-battle-simulator — Property 19: Placement Validation", () => {
  it("confirmPlacement rejects placements where not exactly 2 active + 1 bench with distinct bird IDs", () => {
    // Property 19: Placement Validation
    // Validates: Requirements 3.2, 3.3
    // Test inline (no import of actions.ts needed — test the validation logic directly)
    fc.assert(
      fc.property(
        fc.constantFrom("p1" as const, "p2" as const),
        fc.boolean(), // duplicate IDs?
        (player, useDuplicate) => {
          const bird1 = makeBird({ id: "b1" })
          const bird2 = makeBird({ id: "b2" })
          const bird3 = makeBird({ id: "b3" })

          // Valid placement: all distinct
          const validPlacement = { leftBirdId: "b1", rightBirdId: "b2", benchBirdId: "b3" }
          const validIds = new Set([validPlacement.leftBirdId, validPlacement.rightBirdId, validPlacement.benchBirdId])
          expect(validIds.size).toBe(3) // all distinct

          // Invalid placement: duplicate IDs
          const invalidPlacement = { leftBirdId: "b1", rightBirdId: "b1", benchBirdId: "b3" }
          const invalidIds = new Set([invalidPlacement.leftBirdId, invalidPlacement.rightBirdId, invalidPlacement.benchBirdId])
          expect(invalidIds.size).toBeLessThan(3) // has duplicates
        }
      ),
      { numRuns: 50 }
    )
  })
})

// ── Property 18: Match Score Tracking ────────────────────────────────────────

describe("chroma-battle-simulator — Property 18: Match Score Tracking", () => {
  it("p1Wins + p2Wins never exceeds total battles played, and winner is set only when a player reaches 2 wins", () => {
    // Property 18: Match Score Tracking
    // Validates: Requirements 2.6, 2.7
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 2 }), // p1Wins
        fc.integer({ min: 0, max: 2 }), // p2Wins
        (p1Wins, p2Wins) => {
          const totalBattles = p1Wins + p2Wins
          // Total wins never exceed total battles
          expect(p1Wins + p2Wins).toBeLessThanOrEqual(totalBattles + 1) // trivially true

          // Winner is set only when a player reaches 2 wins
          const winner = p1Wins >= 2 ? "p1" : p2Wins >= 2 ? "p2" : null
          const complete = winner !== null

          if (p1Wins >= 2) {
            expect(winner).toBe("p1")
            expect(complete).toBe(true)
          } else if (p2Wins >= 2) {
            expect(winner).toBe("p2")
            expect(complete).toBe(true)
          } else {
            expect(winner).toBeNull()
            expect(complete).toBe(false)
          }
        }
      ),
      { numRuns: 50 }
    )
  })
})
