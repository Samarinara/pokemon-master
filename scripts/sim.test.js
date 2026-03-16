/**
 * Bug Condition Exploration Tests
 *
 * Property 1: Bug Condition — parseRequestFromOutput Returns Null for Valid Sideupdate Block
 *
 * These tests are EXPECTED TO FAIL on unfixed code.
 * Failure confirms the bug exists: parseRequestFromOutput returns null even when
 * a valid sideupdate block is present in the output.
 *
 * Root cause: runBattleCommand sends simulator input WITHOUT a trailing newline,
 * so the simulator only flushes a partial output (no sideupdate block).
 * parseRequestFromOutput then correctly returns null on that truncated output,
 * causing startBattle() to set status = "ended" immediately.
 *
 * Validates: Requirements 1.1, 1.2
 */

import { describe, it, expect } from "vitest"
import { createRequire } from "module"
import { execSync } from "child_process"

const require = createRequire(import.meta.url)
const { parseRequestFromOutput } = require("./sim.cjs")

const VALID_REQUEST_JSON = JSON.stringify({
  active: [{ moves: [{ move: "Tackle" }] }],
  side: { pokemon: [] },
})

/** Run the simulator with the given input string and return raw stdout */
function runSimulator(input) {
  return execSync(
    "node ./node_modules/pokemon-showdown/pokemon-showdown simulate-battle",
    { input, encoding: "utf-8", maxBuffer: 10 * 1024 * 1024 }
  )
}

describe("parseRequestFromOutput — Bug Condition Exploration", () => {
  // ── Synthetic string tests (these pass on both unfixed and fixed code) ──────

  it("returns non-null for a minimal p1 sideupdate block (synthetic string)", () => {
    const output = `sideupdate\np1\n|request|${VALID_REQUEST_JSON}`
    const result = parseRequestFromOutput(output, "p1")
    expect(result).not.toBeNull()
  })

  it("returns non-null when sideupdate block is embedded in surrounding simulator lines (synthetic string)", () => {
    const output = [
      "|update|",
      "|turn|1",
      "|move|p2a: Bulbasaur|Tackle|p1a: Charmander",
      "sideupdate",
      "p1",
      `|request|${VALID_REQUEST_JSON}`,
      "|upkeep|",
    ].join("\n")
    const result = parseRequestFromOutput(output, "p1")
    expect(result).not.toBeNull()
  })

  it("returns null when querying p2 on a p1-only output (should PASS on both unfixed and fixed code)", () => {
    const output = `sideupdate\np1\n|request|${VALID_REQUEST_JSON}`
    const result = parseRequestFromOutput(output, "p2")
    expect(result).toBeNull()
  })

  // ── Real simulator output tests (these expose the actual bug) ───────────────

  it("simulator returns sideupdate block when input has trailing newline", () => {
    // With trailing newline the simulator flushes the full output including sideupdate
    const inputWithNewline =
      ">start {\"formatid\":\"gen9randombattle\"}\n>player p1 {\"name\":\"Player 1\"}\n>player p2 {\"name\":\"Player 2\"}\n"
    const output = runSimulator(inputWithNewline)
    expect(output).toContain("sideupdate")
  })

  it("simulator does NOT return sideupdate block when input lacks trailing newline (EXPECTED TO FAIL on unfixed code — confirms bug)", () => {
    // Without trailing newline (as in the current startBattle() implementation),
    // the simulator only flushes a partial output with no sideupdate block.
    // parseRequestFromOutput then returns null, causing status = "ended" immediately.
    const inputNoNewline =
      ">start {\"formatid\":\"gen9randombattle\"}\n>player p1 {\"name\":\"Player 1\"}\n>player p2 {\"name\":\"Player 2\"}"
    const output = runSimulator(inputNoNewline)
    // On unfixed code: output is ~63 bytes with no sideupdate — this assertion FAILS
    // That failure is the expected outcome — it proves the bug exists
    expect(output).toContain("sideupdate")
  })

  it("parseRequestFromOutput returns null on the truncated output produced by unfixed startBattle (EXPECTED TO FAIL on unfixed code)", () => {
    // Reproduce exactly what startBattle() does: no trailing newline
    const inputNoNewline =
      ">start {\"formatid\":\"gen9randombattle\"}\n>player p1 {\"name\":\"Player 1\"}\n>player p2 {\"name\":\"Player 2\"}"
    const output = runSimulator(inputNoNewline)
    // On unfixed code: output has no sideupdate, so parseRequestFromOutput returns null
    // This assertion (non-null) FAILS — confirming the bug
    const result = parseRequestFromOutput(output, "p1")
    expect(result).not.toBeNull()
  })
})

/**
 * Preservation Property Tests
 *
 * Property 2: Preservation — Null Returned for All Non-Sideupdate Outputs
 *
 * These tests PASS on unfixed code (they confirm existing null-returning behavior
 * that must be preserved after the fix is applied).
 *
 * Validates: Requirements 3.1, 3.2, 3.3
 */

import * as fc from "fast-check"

describe("parseRequestFromOutput — Preservation (null-returning behavior)", () => {
  // ── Concrete baseline observations ──────────────────────────────────────────

  it("returns null for win-only output (no sideupdate)", () => {
    const output = "|win|Player 1\n"
    expect(parseRequestFromOutput(output, "p1")).toBeNull()
  })

  it("returns null when querying wrong player (p2 on p1 sideupdate)", () => {
    const output = `sideupdate\np1\n|request|${VALID_REQUEST_JSON}`
    expect(parseRequestFromOutput(output, "p2")).toBeNull()
  })

  it("returns null when querying wrong player (p1 on p2 sideupdate)", () => {
    const output = `sideupdate\np2\n|request|${VALID_REQUEST_JSON}`
    expect(parseRequestFromOutput(output, "p1")).toBeNull()
  })

  it("returns null for malformed JSON in sideupdate block", () => {
    const output = "sideupdate\np1\n|request|not-valid-json"
    expect(parseRequestFromOutput(output, "p1")).toBeNull()
  })

  it("returns null for empty output", () => {
    expect(parseRequestFromOutput("", "p1")).toBeNull()
  })

  // ── Property-based tests ─────────────────────────────────────────────────────

  it("property: win-only output always returns null for any player", () => {
    /**
     * Validates: Requirements 3.1, 3.2, 3.3
     *
     * For any output string containing only a |win| line (no sideupdate),
     * parseRequestFromOutput must return null for both p1 and p2.
     */
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 50 }).filter((s) => !s.includes("\n")),
        fc.constantFrom("p1", "p2"),
        (winnerName, player) => {
          const output = `|win|${winnerName}\n`
          return parseRequestFromOutput(output, player) === null
        }
      )
    )
  })

  it("property: sideupdate for p1 always returns null when querying p2 (and vice versa)", () => {
    /**
     * Validates: Requirements 3.1, 3.2, 3.3
     *
     * For any output with a sideupdate block for one player,
     * querying the other player must return null.
     */
    fc.assert(
      fc.property(
        fc.constantFrom("p1", "p2"),
        (sidePlayer) => {
          const queryPlayer = sidePlayer === "p1" ? "p2" : "p1"
          const output = `sideupdate\n${sidePlayer}\n|request|${VALID_REQUEST_JSON}`
          return parseRequestFromOutput(output, queryPlayer) === null
        }
      )
    )
  })

  it("property: sideupdate block with malformed JSON always returns null", () => {
    /**
     * Validates: Requirements 3.1, 3.2, 3.3
     *
     * For any output with a sideupdate block whose JSON is malformed,
     * parseRequestFromOutput must return null.
     */
    fc.assert(
      fc.property(
        fc.constantFrom("p1", "p2"),
        // Generate strings that are definitely not valid JSON objects
        fc.string({ minLength: 1, maxLength: 30 }).filter((s) => {
          try {
            JSON.parse(s)
            return false
          } catch {
            return true
          }
        }),
        (player, badJson) => {
          const output = `sideupdate\n${player}\n|request|${badJson}`
          return parseRequestFromOutput(output, player) === null
        }
      )
    )
  })

  it("property: output with no 'sideupdate' keyword always returns null", () => {
    /**
     * Validates: Requirements 3.1, 3.2, 3.3
     *
     * For any random string that contains no 'sideupdate' keyword,
     * parseRequestFromOutput must return null for any player.
     */
    fc.assert(
      fc.property(
        fc.string({ maxLength: 200 }).filter((s) => !s.includes("sideupdate")),
        fc.constantFrom("p1", "p2"),
        (output, player) => {
          return parseRequestFromOutput(output, player) === null
        }
      )
    )
  })
})

/**
 * Additional Unit Tests — Task 4
 *
 * Validates: Requirements 2.1, 2.2, 2.3, 3.1, 3.2
 */

const { startBattle, makeChoice } = require("./sim.cjs")

const FORCE_SWITCH_REQUEST_JSON = JSON.stringify({
  forceSwitch: [true],
  side: { pokemon: [] },
})

describe("parseRequestFromOutput — Additional Unit Tests", () => {
  it("Unit — forceSwitch request: returns request with forceSwitch field populated", () => {
    const output = `sideupdate\np1\n|request|${FORCE_SWITCH_REQUEST_JSON}`
    const result = parseRequestFromOutput(output, "p1")
    expect(result).not.toBeNull()
    expect(result.forceSwitch).toBeTruthy()
  })

  it("Unit — p2 request: returns non-null for a p2 sideupdate block", () => {
    const output = `sideupdate\np2\n|request|${VALID_REQUEST_JSON}`
    const result = parseRequestFromOutput(output, "p2")
    expect(result).not.toBeNull()
  })

  it("Unit — request embedded in full output: returns non-null with realistic surrounding content", () => {
    const output = [
      "|update|",
      "|gametype|singles",
      "|player|p1|Player 1|",
      "|player|p2|Player 2|",
      "|teamsize|p1|6",
      "|teamsize|p2|6",
      "|gen|9",
      "|tier|[Gen 9] Random Battle",
      "|start",
      "|switch|p1a: Pikachu|Pikachu, L50|100/100",
      "|switch|p2a: Bulbasaur|Bulbasaur, L50|100/100",
      "|turn|1",
      "sideupdate",
      "p1",
      `|request|${VALID_REQUEST_JSON}`,
      "|upkeep|",
    ].join("\n")
    const result = parseRequestFromOutput(output, "p1")
    expect(result).not.toBeNull()
  })
})

describe("Integration — startBattle() and makeChoice()", () => {
  it("Integration — startBattle(): returns p1_turn with available moves", async () => {
    const state = await startBattle()
    expect(state.status).toBe("p1_turn")
    expect(state.availableMoves.length).toBeGreaterThan(0)
    expect(state.winner).toBeNull()
  }, 30000)

  it("Integration — makeChoice(): after move 1, status transitions away from p1_turn", async () => {
    const state = await startBattle()
    const nextState = await makeChoice(state, "move 1")
    expect(["p2_turn", "ended"]).toContain(nextState.status)
    expect(nextState.status).not.toBe("p1_turn")
  }, 30000)
})
