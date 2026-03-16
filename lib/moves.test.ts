import * as fc from "fast-check"
import { describe, it, expect } from "vitest"
import { parseMove, printMove, parseRoster } from "./moves"
import type { Move } from "./types"

// ── Arbitraries ─────────────────────────────────────────────────────────────

const arbitraryColour = () =>
  fc.constantFrom("Red", "Yellow", "Blue", "Orange", "Purple", "Green", "Pink", "Black" as const)

const arbitraryHeight = () => fc.constantFrom("High", "Mid", "Low" as const)

const arbitraryPowerTier = () => fc.constantFrom("Weak", "Normal", "Strong" as const)

const arbitraryStatusCondition = () => fc.constantFrom("Bleed", "Shaken", "Bruised" as const)

const arbitraryStat = () => fc.constantFrom("hp", "str", "guts", "spd", "spirit" as const)

const arbitraryStatStages = () => fc.constantFrom(1, 2, -1, -2 as const)

const arbitraryMove = (): fc.Arbitrary<Move> =>
  fc
    .record({
      id: fc.string({ minLength: 1, maxLength: 20 }).filter((s) => s.trim().length > 0),
      name: fc.string({ minLength: 1, maxLength: 30 }).filter((s) => s.trim().length > 0),
      colour: arbitraryColour(),
      height: arbitraryHeight(),
      powerTier: arbitraryPowerTier(),
      accuracy: fc.integer({ min: 10, max: 100 }),
      priority: fc.integer({ min: -5, max: 5 }),
      statStage: fc.option(
        fc.record({
          target: fc.constantFrom("self", "opponent" as const),
          stat: arbitraryStat(),
          stages: arbitraryStatStages(),
        }),
        { nil: undefined }
      ),
      status: fc.option(
        fc.record({
          condition: arbitraryStatusCondition(),
          procChance: fc.integer({ min: 0, max: 100 }),
        }),
        { nil: undefined }
      ),
      flags: fc.record({
        reversalLegal: fc.boolean(),
        switchAttackLegal: fc.boolean(),
        contact: fc.boolean(),
        special: fc.boolean(),
      }),
    })
    .map((m) => {
      // Remove undefined optional fields to match Move interface
      const move: Move = {
        id: m.id,
        name: m.name,
        colour: m.colour as any,
        height: m.height as any,
        powerTier: m.powerTier as any,
        accuracy: m.accuracy,
        priority: m.priority,
        flags: m.flags,
      }
      if (m.statStage !== undefined) move.statStage = m.statStage as any
      if (m.status !== undefined) move.status = m.status as any
      return move
    })

// ── Property 20: Move Round-Trip ─────────────────────────────────────────────

describe("chroma-battle-simulator — Property 20: Move Round-Trip", () => {
  it("parseMove(printMove(move)) produces an equivalent Move record", () => {
    // Feature: chroma-battle-simulator, Property 20: Move Round-Trip
    // Validates: Requirements 16.1, 16.2, 16.3, 16.4, 16.5
    fc.assert(
      fc.property(arbitraryMove(), (move) => {
        const printed = printMove(move)
        const result = parseMove(printed)
        if (!result.ok) return false
        const parsed = result.value
        // All fields must be equal
        expect(parsed.id).toBe(move.id)
        expect(parsed.name).toBe(move.name)
        expect(parsed.colour).toBe(move.colour)
        expect(parsed.height).toBe(move.height)
        expect(parsed.powerTier).toBe(move.powerTier)
        expect(parsed.accuracy).toBe(move.accuracy)
        expect(parsed.priority).toBe(move.priority)
        expect(parsed.flags).toEqual(move.flags)
        expect(parsed.statStage).toEqual(move.statStage)
        expect(parsed.status).toEqual(move.status)
        return true
      }),
      { numRuns: 100 }
    )
  })

  it("parseMove returns an error identifying the offending field for invalid input", () => {
    // Feature: chroma-battle-simulator, Property 20: Move Round-Trip (error path)
    // Validates: Requirements 16.2
    fc.assert(
      fc.property(arbitraryMove(), (move) => {
        // Corrupt the colour field
        const bad = { ...printMove(move), colour: "NotAColour" }
        const result = parseMove(bad)
        if (result.ok) return false
        expect(result.error.field).toBe("colour")
        expect(result.error.message).toBeTruthy()
        return true
      }),
      { numRuns: 100 }
    )
  })
})

// ── Unit tests ───────────────────────────────────────────────────────────────

describe("parseMove", () => {
  const validMove = {
    id: "tackle",
    name: "Tackle",
    colour: "Red",
    height: "Mid",
    powerTier: "Normal",
    accuracy: 95,
    priority: 0,
    flags: { reversalLegal: false, switchAttackLegal: false, contact: true, special: false },
  }

  it("parses a valid move definition", () => {
    const result = parseMove(validMove)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.id).toBe("tackle")
      expect(result.value.colour).toBe("Red")
      expect(result.value.accuracy).toBe(95)
    }
  })

  it("defaults priority to 0 when omitted", () => {
    const { priority: _, ...withoutPriority } = validMove as typeof validMove & { priority?: number }
    const result = parseMove(withoutPriority)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.priority).toBe(0)
  })

  it("parses optional statStage", () => {
    const withStatStage = {
      ...validMove,
      statStage: { target: "self", stat: "str", stages: 1 },
    }
    const result = parseMove(withStatStage)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.statStage).toEqual({ target: "self", stat: "str", stages: 1 })
    }
  })

  it("parses optional status", () => {
    const withStatus = {
      ...validMove,
      status: { condition: "Bleed", procChance: 30 },
    }
    const result = parseMove(withStatus)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.status).toEqual({ condition: "Bleed", procChance: 30 })
    }
  })

  it("returns error for non-object input", () => {
    const result = parseMove("not an object")
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.field).toBe("root")
  })

  it("returns error for invalid colour", () => {
    const result = parseMove({ ...validMove, colour: "Purple2" })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.field).toBe("colour")
  })

  it("returns error for accuracy out of range", () => {
    const result = parseMove({ ...validMove, accuracy: 5 })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.field).toBe("accuracy")
  })

  it("returns error for non-integer priority", () => {
    const result = parseMove({ ...validMove, priority: 1.5 })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.field).toBe("priority")
  })

  it("returns error for invalid statStage.stages", () => {
    const result = parseMove({ ...validMove, statStage: { target: "self", stat: "str", stages: 3 } })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.field).toBe("statStage.stages")
  })

  it("returns error for missing flags", () => {
    const { flags: _, ...noFlags } = validMove
    const result = parseMove(noFlags)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.field).toBe("flags")
  })
})

describe("printMove", () => {
  it("serialises a Move to a plain object", () => {
    const move: Move = {
      id: "peck",
      name: "Peck",
      colour: "Blue",
      height: "High",
      powerTier: "Weak",
      accuracy: 100,
      priority: 1,
      flags: { reversalLegal: true, switchAttackLegal: false, contact: true, special: false },
    }
    const def = printMove(move)
    expect(def.id).toBe("peck")
    expect(def.colour).toBe("Blue")
    expect(def.priority).toBe(1)
    expect(def.statStage).toBeUndefined()
    expect(def.status).toBeUndefined()
  })
})

describe("parseRoster", () => {
  const makeMove = (id: string) => ({
    id,
    name: `Move ${id}`,
    colour: "Red",
    height: "Mid",
    powerTier: "Normal",
    accuracy: 80,
    priority: 0,
    flags: { reversalLegal: false, switchAttackLegal: false, contact: true, special: false },
  })

  const makeBird = (id: string) => ({
    id,
    name: `Bird ${id}`,
    colour: "Red",
    baseStats: { hp: 150, str: 80, guts: 80, spd: 80, spirit: 80 },
    moves: [makeMove(`${id}-m1`), makeMove(`${id}-m2`), makeMove(`${id}-m3`), makeMove(`${id}-m4`)],
  })

  it("parses a valid roster with 3 birds", () => {
    const raw = { birds: [makeBird("a"), makeBird("b"), makeBird("c")] }
    const result = parseRoster(raw)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.birds).toHaveLength(3)
  })

  it("returns error when birds count is not 3", () => {
    const raw = { birds: [makeBird("a"), makeBird("b")] }
    const result = parseRoster(raw)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.field).toBe("birds")
  })

  it("returns error for duplicate bird ids", () => {
    const raw = { birds: [makeBird("a"), makeBird("a"), makeBird("b")] }
    const result = parseRoster(raw)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.field).toBe("birds")
  })

  it("returns error when a bird has wrong move count", () => {
    const bird = { ...makeBird("a"), moves: [makeMove("m1")] }
    const raw = { birds: [bird, makeBird("b"), makeBird("c")] }
    const result = parseRoster(raw)
    expect(result.ok).toBe(false)
  })
})
