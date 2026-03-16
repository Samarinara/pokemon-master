import * as fc from "fast-check"
import { describe, it, expect } from "vitest"
import { generateRoster, generateBird } from "./teamgen"
import { createRng } from "./rng"
import type { Colour } from "./types"

const VALID_COLOURS: Colour[] = ["Red", "Yellow", "Blue", "Orange", "Purple", "Green", "Pink", "Black"]

// ── Property 1: Roster Structure Invariant ────────────────────────────────────

describe("chroma-battle-simulator — Property 1: Roster Structure Invariant", () => {
  it("generateRoster returns exactly 3 distinct birds each with exactly 4 moves", () => {
    // Feature: chroma-battle-simulator, Property 1: Roster Structure Invariant
    // Validates: Requirements 1.1, 1.2, 1.5, 1.7
    fc.assert(
      fc.property(fc.constant(null), () => {
        const rng = createRng()
        const roster = generateRoster(rng)

        // Exactly 3 birds
        expect(roster.birds).toHaveLength(3)

        // All bird identities must be distinct (by id)
        const ids = roster.birds.map((b) => b.id)
        const uniqueIds = new Set(ids)
        expect(uniqueIds.size).toBe(3)

        // Each bird must have exactly 4 moves
        for (const bird of roster.birds) {
          expect(bird.moves).toHaveLength(4)
        }

        return true
      }),
      { numRuns: 100 }
    )
  })
})

// ── Property 2: Generated Bird Stat Invariants ────────────────────────────────

describe("chroma-battle-simulator — Property 2: Generated Bird Stat Invariants", () => {
  it("generateBird produces a bird with valid colour and stats in required ranges", () => {
    // Feature: chroma-battle-simulator, Property 2: Generated Bird Stat Invariants
    // Validates: Requirements 1.3, 1.4
    fc.assert(
      fc.property(fc.constant(null), () => {
        const rng = createRng()
        const bird = generateBird(rng, new Set())

        // Colour must be one of the 8 valid colours
        expect(VALID_COLOURS).toContain(bird.colour)

        // HP must be in [120, 220]
        expect(bird.baseStats.hp).toBeGreaterThanOrEqual(120)
        expect(bird.baseStats.hp).toBeLessThanOrEqual(220)

        // STR, GUTS, SPD, SPIRIT must each be in [60, 140]
        expect(bird.baseStats.str).toBeGreaterThanOrEqual(60)
        expect(bird.baseStats.str).toBeLessThanOrEqual(140)

        expect(bird.baseStats.guts).toBeGreaterThanOrEqual(60)
        expect(bird.baseStats.guts).toBeLessThanOrEqual(140)

        expect(bird.baseStats.spd).toBeGreaterThanOrEqual(60)
        expect(bird.baseStats.spd).toBeLessThanOrEqual(140)

        expect(bird.baseStats.spirit).toBeGreaterThanOrEqual(60)
        expect(bird.baseStats.spirit).toBeLessThanOrEqual(140)

        return true
      }),
      { numRuns: 100 }
    )
  })
})
