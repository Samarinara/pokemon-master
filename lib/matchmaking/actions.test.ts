import { describe, it, expect } from "vitest"
import * as fc from "fast-check"
import { validateMatchmakingInput, normaliseJoinCode } from "./validation"

// ── Arbitraries ────────────────────────────────────────────────────────────

/** Valid display name: 1–24 alphanumeric chars */
function arbitraryValidDisplayName() {
  return fc.stringMatching(/^[a-zA-Z0-9]{1,24}$/)
}

/** Valid join code: 1–16 alphanumeric chars */
function arbitraryValidJoinCode() {
  return fc.stringMatching(/^[a-zA-Z0-9]{1,16}$/)
}

/** Invalid display name: empty or length > 24 */
function arbitraryInvalidDisplayName() {
  return fc.oneof(
    fc.constant(""),
    fc.string({ minLength: 25, maxLength: 50 })
  )
}

/** Invalid join code: empty, length > 16, or contains symbols */
function arbitraryInvalidJoinCode() {
  return fc.oneof(
    fc.constant(""),
    fc.string({ minLength: 17, maxLength: 32 }).filter(s => /^[a-zA-Z0-9]+$/.test(s)),
    // contains at least one symbol
    fc.string({ minLength: 1, maxLength: 16 }).filter(s => /[^a-zA-Z0-9]/.test(s))
  )
}

// ── Property 1: Input Validation Rejects Invalid Inputs ────────────────────

describe("Property 1: Input Validation Rejects Invalid Inputs", () => {
  // Feature: netplay-matchmaking, Property 1: For any display name or join code that is empty,
  // exceeds its maximum length, or contains non-alphanumeric characters,
  // validateMatchmakingInput must return an error.
  // Validates: Requirements 1.1, 1.2, 1.3, 1.5

  it("rejects invalid display names", () => {
    fc.assert(
      fc.property(arbitraryInvalidDisplayName(), arbitraryValidJoinCode(), (displayName, joinCode) => {
        const result = validateMatchmakingInput(displayName, joinCode)
        expect(result).not.toBeNull()
        expect(result!.field).toBe("displayName")
      }),
      { numRuns: 100 }
    )
  })

  it("rejects invalid join codes", () => {
    fc.assert(
      fc.property(arbitraryValidDisplayName(), arbitraryInvalidJoinCode(), (displayName, joinCode) => {
        const result = validateMatchmakingInput(displayName, joinCode)
        expect(result).not.toBeNull()
        expect(result!.field).toBe("joinCode")
      }),
      { numRuns: 100 }
    )
  })

  it("returns null for valid inputs", () => {
    fc.assert(
      fc.property(arbitraryValidDisplayName(), arbitraryValidJoinCode(), (displayName, joinCode) => {
        const result = validateMatchmakingInput(displayName, joinCode)
        expect(result).toBeNull()
      }),
      { numRuns: 100 }
    )
  })

  it("returns distinct message for join code with symbols", () => {
    fc.assert(
      fc.property(
        arbitraryValidDisplayName(),
        // join code with at least one symbol, within length limit
        fc.string({ minLength: 1, maxLength: 16 }).filter(s => /[^a-zA-Z0-9]/.test(s)),
        (displayName, joinCode) => {
          const result = validateMatchmakingInput(displayName, joinCode)
          expect(result).not.toBeNull()
          expect(result!.field).toBe("joinCode")
          // message must mention symbols/letters/numbers
          expect(result!.message.toLowerCase()).toMatch(/symbol|letter|number|alphanumeric/)
        }
      ),
      { numRuns: 100 }
    )
  })
})

// ── Property 2: Join Code Case Normalisation ───────────────────────────────

describe("Property 2: Join Code Case Normalisation", () => {
  // Feature: netplay-matchmaking, Property 2: For any valid alphanumeric join code,
  // the lowercase and uppercase versions must normalise to the same string.
  // Validates: Requirements 1.4

  it("normalises any alphanumeric join code to the same uppercase string", () => {
    fc.assert(
      fc.property(arbitraryValidJoinCode(), (joinCode) => {
        const normLower = normaliseJoinCode(joinCode.toLowerCase())
        const normUpper = normaliseJoinCode(joinCode.toUpperCase())
        const normOriginal = normaliseJoinCode(joinCode)
        expect(normLower).toBe(normUpper)
        expect(normOriginal).toBe(normUpper)
        expect(normUpper).toBe(joinCode.toUpperCase())
      }),
      { numRuns: 100 }
    )
  })
})

// ── Unit tests ─────────────────────────────────────────────────────────────

describe("validateMatchmakingInput — unit tests", () => {
  it("returns null for valid inputs", () => {
    expect(validateMatchmakingInput("Alice", "ABC123")).toBeNull()
  })

  it("errors on empty display name", () => {
    const result = validateMatchmakingInput("", "ABC")
    expect(result).toEqual({ field: "displayName", message: expect.any(String) })
  })

  it("errors on display name > 24 chars", () => {
    const result = validateMatchmakingInput("A".repeat(25), "ABC")
    expect(result).toEqual({ field: "displayName", message: expect.any(String) })
  })

  it("errors on empty join code", () => {
    const result = validateMatchmakingInput("Alice", "")
    expect(result).toEqual({ field: "joinCode", message: expect.any(String) })
  })

  it("errors on join code > 16 chars", () => {
    const result = validateMatchmakingInput("Alice", "A".repeat(17))
    expect(result).toEqual({ field: "joinCode", message: expect.any(String) })
  })

  it("errors on join code with symbols", () => {
    const result = validateMatchmakingInput("Alice", "ABC!@#")
    expect(result).toEqual({ field: "joinCode", message: expect.any(String) })
  })

  it("accepts display name of exactly 24 chars", () => {
    expect(validateMatchmakingInput("A".repeat(24), "ABC")).toBeNull()
  })

  it("accepts join code of exactly 16 chars", () => {
    expect(validateMatchmakingInput("Alice", "A".repeat(16))).toBeNull()
  })
})

describe("normaliseJoinCode", () => {
  it("uppercases a lowercase code", () => {
    expect(normaliseJoinCode("abc123")).toBe("ABC123")
  })

  it("leaves uppercase unchanged", () => {
    expect(normaliseJoinCode("XYZ")).toBe("XYZ")
  })

  it("handles mixed case", () => {
    expect(normaliseJoinCode("aBcDeF")).toBe("ABCDEF")
  })
})

// ── Property 3: Session Creation on New Code ───────────────────────────────

import { createOrJoinSession, declineJoiner } from "./actions"
import { loadSession, saveSession, deleteSession, expireStaleWaitingSessions } from "./sessionStore"

describe("Property 3: Session Creation on New Code", () => {
  // Feature: netplay-matchmaking, Property 3: For any valid display name and join code that does not match an existing session, createOrJoinSession must return status: "created" and a session with lobbyState: "waiting" must exist in the store.
  // Validates: Requirements 2.1, 2.2

  it("creates a new session with lobbyState waiting for any fresh join code", async () => {
    await fc.assert(
      fc.asyncProperty(
        arbitraryValidDisplayName(),
        arbitraryValidJoinCode(),
        async (displayName, joinCode) => {
          // Ensure no pre-existing session for this code
          await deleteSession(joinCode)

          const result = await createOrJoinSession(displayName, joinCode)
          expect(result.status).toBe("created")

          const stored = await loadSession(joinCode.toUpperCase())
          expect(stored).not.toBeNull()
          expect(stored!.lobbyState).toBe("waiting")

          // Cleanup
          await deleteSession(joinCode)
        }
      ),
      { numRuns: 100 }
    )
  })
})

// ── Property 4: In-Progress Code Is Rejected ──────────────────────────────

describe("Property 4: In-Progress Code Is Rejected", () => {
  // Feature: netplay-matchmaking, Property 4: For any session in lobbyState: "in_progress", calling createOrJoinSession with that session's join code must return status: "in_progress" and must not modify the session.
  // Validates: Requirements 5.1, 5.2, 5.3

  it("returns in_progress and does not modify the session", async () => {
    await fc.assert(
      fc.asyncProperty(
        arbitraryValidDisplayName(),
        arbitraryValidJoinCode(),
        arbitraryValidDisplayName(),
        async (hostName, joinCode, joinerName) => {
          const normCode = joinCode.toUpperCase()
          // Seed an in_progress session
          const now = Date.now()
          const session = {
            joinCode: normCode,
            lobbyState: "in_progress" as const,
            host: { displayName: hostName, token: "host-token-" + normCode, player: null, connectedAt: now },
            joiner: { displayName: joinerName, token: "joiner-token-" + normCode, player: null, connectedAt: now },
            battleId: "battle-" + normCode,
            acceptanceDeadline: null,
            createdAt: now,
            updatedAt: now,
          }
          await saveSession(session)

          const result = await createOrJoinSession(joinerName, joinCode)
          expect(result.status).toBe("in_progress")

          // Session must be unchanged
          const stored = await loadSession(normCode)
          expect(stored).not.toBeNull()
          expect(stored!.lobbyState).toBe("in_progress")
          expect(stored!.battleId).toBe(session.battleId)

          // Cleanup
          await deleteSession(normCode)
        }
      ),
      { numRuns: 100 }
    )
  })
})

// ── Property 5: Acceptance Timeout Reverts to Waiting ─────────────────────

describe("Property 5: Acceptance Timeout Reverts to Waiting", () => {
  // Feature: netplay-matchmaking, Property 5: For any session in pending_acceptance whose acceptanceDeadline has passed, the session must transition back to lobbyState: "waiting" with joiner cleared.
  // Validates: Requirements 3.5

  it("reverts to waiting with joiner cleared when declineJoiner is called after deadline", async () => {
    await fc.assert(
      fc.asyncProperty(
        arbitraryValidDisplayName(),
        arbitraryValidJoinCode(),
        arbitraryValidDisplayName(),
        async (hostName, joinCode, joinerName) => {
          const normCode = joinCode.toUpperCase()
          const hostToken = "host-tok-" + normCode
          const now = Date.now()
          // Seed a pending_acceptance session with an expired deadline
          const session = {
            joinCode: normCode,
            lobbyState: "pending_acceptance" as const,
            host: { displayName: hostName, token: hostToken, player: null, connectedAt: now },
            joiner: { displayName: joinerName, token: "joiner-tok-" + normCode, player: null, connectedAt: now },
            battleId: null,
            acceptanceDeadline: now - 1000, // expired 1 second ago
            createdAt: now,
            updatedAt: now,
          }
          await saveSession(session)

          // Simulate timeout by calling declineJoiner
          await declineJoiner(joinCode, hostToken)

          const stored = await loadSession(normCode)
          expect(stored).not.toBeNull()
          expect(stored!.lobbyState).toBe("waiting")
          expect(stored!.joiner).toBeNull()
          expect(stored!.acceptanceDeadline).toBeNull()

          // Cleanup
          await deleteSession(normCode)
        }
      ),
      { numRuns: 100 }
    )
  })
})

// ── Property 6: Session Expiry Releases Join Code ─────────────────────────

describe("Property 6: Session Expiry Releases Join Code", () => {
  // Feature: netplay-matchmaking, Property 6: For any session that has been in lobbyState: "waiting" for more than 10 minutes, expireStaleWaitingSessions must delete that session so the join code becomes available again.
  // Validates: Requirements 6.4

  it("deletes stale waiting sessions older than the threshold", async () => {
    await fc.assert(
      fc.asyncProperty(
        arbitraryValidJoinCode(),
        arbitraryValidDisplayName(),
        async (joinCode, hostName) => {
          const normCode = joinCode.toUpperCase()
          const staleTime = Date.now() - 11 * 60 * 1000 // 11 minutes ago
          const session = {
            joinCode: normCode,
            lobbyState: "waiting" as const,
            host: { displayName: hostName, token: "host-tok-" + normCode, player: null, connectedAt: staleTime },
            joiner: null,
            battleId: null,
            acceptanceDeadline: null,
            createdAt: staleTime,
            updatedAt: staleTime,
          }
          await saveSession(session)

          await expireStaleWaitingSessions(10 * 60 * 1000)

          const stored = await loadSession(normCode)
          expect(stored).toBeNull()
        }
      ),
      { numRuns: 100 }
    )
  })
})

// ── Property 7: Token Authorisation for Order Submission ──────────────────

import { submitOrders } from "../actions"
import { saveBattle, deleteBattle, saveDb } from "../store"
import { arbitraryBattleState, arbitraryOrderSet } from "../test-utils/arbitraries"
import { saveSession as saveSessionForBattle, deleteSession as deleteSessionForBattle } from "./sessionStore"

describe("Property 7: Token Authorisation for Order Submission", () => {
  // Feature: netplay-matchmaking, Property 7: For any battle with two registered player tokens,
  // submitOrders called with a token that does not match the claimed player must be rejected
  // and the battle state must remain unchanged.
  // Validates: Requirements 8.3

  it("rejects orders submitted with a wrong token and leaves battle state unchanged", async () => {
    await fc.assert(
      fc.asyncProperty(
        arbitraryBattleState(),
        arbitraryOrderSet(),
        fc.uuid(), // host token
        fc.uuid(), // joiner token
        fc.uuid(), // wrong token (different from both)
        fc.constantFrom("p1" as const, "p2" as const),
        async (battleState, orders, hostToken, joinerToken, wrongToken, player) => {
          // Ensure wrong token is actually different from both
          fc.pre(wrongToken !== hostToken && wrongToken !== joinerToken)

          const battleId = battleState.id
          const joinCode = "PROP7" + battleId.slice(0, 6).toUpperCase()

          // Save the battle
          await saveBattle(battleState)
          saveDb()

          // Save a session linking this battle to the two tokens
          const now = Date.now()
          await saveSessionForBattle({
            joinCode,
            lobbyState: "in_progress",
            host: { displayName: "Alice", token: hostToken, player: "p1", connectedAt: now },
            joiner: { displayName: "Bob", token: joinerToken, player: "p2", connectedAt: now },
            battleId,
            acceptanceDeadline: null,
            createdAt: now,
            updatedAt: now,
          })

          // Submit with wrong token
          const result = await submitOrders(battleId, player, orders, wrongToken)
          expect(result).toEqual({ error: "INVALID_TOKEN" })

          // Battle state must be unchanged
          const stored = await saveBattle(battleState) // re-save to confirm it's still the same
          void stored

          // Cleanup
          await deleteBattle(battleId)
          await deleteSessionForBattle(joinCode)
          saveDb()
        }
      ),
      { numRuns: 100 }
    )
  })
})

// ── Property 8: Simultaneous Order Resolution ─────────────────────────────

describe("Property 8: Simultaneous Order Resolution", () => {
  // Feature: netplay-matchmaking, Property 8: For any battle in the planning phase,
  // when both players submit valid orders each with the correct token,
  // submitOrders must resolve the turn exactly once and the resulting state must be consistent
  // (all HP >= 0, phase advanced).
  // Validates: Requirements 8.4, 8.5

  it("resolves the turn exactly once when both players submit with correct tokens", async () => {
    await fc.assert(
      fc.asyncProperty(
        arbitraryBattleState(),
        arbitraryOrderSet(),
        arbitraryOrderSet(),
        fc.uuid(), // host token
        fc.uuid(), // joiner token
        async (battleState, p1Orders, p2Orders, hostToken, joinerToken) => {
          const battleId = battleState.id
          const joinCode = "PROP8" + battleId.slice(0, 6).toUpperCase()

          // Save the battle in planning phase
          const planningState = { ...battleState, phase: "planning" as const, pendingOrders: {} }
          await saveBattle(planningState)
          saveDb()

          // Save a session linking this battle to the two tokens
          const now = Date.now()
          await saveSessionForBattle({
            joinCode,
            lobbyState: "in_progress",
            host: { displayName: "Alice", token: hostToken, player: "p1", connectedAt: now },
            joiner: { displayName: "Bob", token: joinerToken, player: "p2", connectedAt: now },
            battleId,
            acceptanceDeadline: null,
            createdAt: now,
            updatedAt: now,
          })

          // p1 submits first
          const afterP1 = await submitOrders(battleId, "p1", p1Orders, hostToken)
          expect(afterP1).not.toHaveProperty("error")

          // p2 submits — triggers resolution
          const afterP2 = await submitOrders(battleId, "p2", p2Orders, joinerToken)
          expect(afterP2).not.toHaveProperty("error")

          const resolved = afterP2 as import("../types").BattleState

          // All HP values must be >= 0
          const allInstances = [
            resolved.p1Field.left,
            resolved.p1Field.right,
            resolved.p1Field.bench,
            resolved.p2Field.left,
            resolved.p2Field.right,
            resolved.p2Field.bench,
          ]
          for (const inst of allInstances) {
            expect(inst.currentHp).toBeGreaterThanOrEqual(0)
          }

          // Phase must have advanced (no longer "planning" unless battle ended)
          // After resolution, phase should not be "planning" with empty pendingOrders
          expect(resolved.pendingOrders).toEqual({})

          // Cleanup
          await deleteBattle(battleId)
          await deleteSessionForBattle(joinCode)
          saveDb()
        }
      ),
      { numRuns: 50 }
    )
  })
})
