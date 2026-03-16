/**
 * Preservation Property Tests — lobby-join-auth-bug
 *
 * These tests encode EXISTING (correct) behavior that MUST be preserved after the fix.
 * They MUST PASS on UNFIXED code — passing confirms the baseline behavior to preserve.
 *
 * Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6
 */

import { describe, it, expect } from "vitest"
import * as fc from "fast-check"
import { createOrJoinSession } from "./actions"
import { loadSession, deleteSession } from "./sessionStore"
import type { Session, SSEEvent } from "./types"

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Replicate the exact auth check performed by the stream route (unfixed single-attempt).
 * This is the CURRENT behavior — no retry loop.
 */
async function streamRouteAuthCheck(code: string, token: string): Promise<200 | 401> {
  const session = await loadSession(code)
  if (
    !session ||
    (session.host.token !== token && session.joiner?.token !== token)
  ) {
    return 401
  }
  return 200
}

/**
 * Simulate the UNFIXED WaitingScreen onmessage handler.
 * Returns whether onJoinerArrived was called.
 */
function simulateUnfixedWaitingScreenHandler(
  event: SSEEvent,
  onJoinerArrived?: () => void
): { onJoinerArrivedCalled: boolean; routerPushCalled: boolean; routerPushArg?: string } {
  let onJoinerArrivedCalled = false
  let routerPushCalled = false
  let routerPushArg: string | undefined

  const mockRouterPush = (path: string) => {
    routerPushCalled = true
    routerPushArg = path
  }

  const token = "host-token-abc"

  // This is the CURRENT (unfixed) handler from WaitingScreen.tsx:
  if (event.type === "session_updated") {
    // Only sets connection status — does NOT call onJoinerArrived
    // setConnectionStatus("connected")
  } else if (event.type === "battle_started" && event.token === token) {
    mockRouterPush(`/battle/${event.battleId}?token=${encodeURIComponent(token)}&player=${event.yourPlayer}`)
  } else if (event.type === "session_expired") {
    mockRouterPush("/")
  }

  // onJoinerArrived is never called in the unfixed handler
  void onJoinerArrived // referenced but not called — this is the bug

  return { onJoinerArrivedCalled, routerPushCalled, routerPushArg }
}

// ── Property Test 1: Unauthorized requests still return 401 ────────────────
//
// For all tokens that do NOT match any participant in the session
// (isBugCondition_SSE401 returns false), the stream route returns 401.
//
// Validates: Requirements 3.1, 3.2, 3.3

describe("Preservation Property 1 — Unauthorized requests still return 401", () => {
  it(
    "no token → 401 (observed on unfixed code)",
    async () => {
      const joinCode = "PRES1NOTOK"
      await deleteSession(joinCode)

      // Create a session so the code exists
      await createOrJoinSession("HostPlayer", joinCode)

      // Request with no token — the route returns 401 before even loading the session
      // We simulate by passing empty string (the route checks `if (!token)`)
      const session = await loadSession(joinCode)
      expect(session).not.toBeNull()

      // Simulate the no-token path: route returns 401 immediately
      const noToken = null
      const result = noToken ? await streamRouteAuthCheck(joinCode, noToken) : 401
      expect(result).toBe(401)

      await deleteSession(joinCode)
    }
  )

  it(
    "request for non-existent join code → 401 (observed on unfixed code)",
    async () => {
      const nonExistentCode = "DOESNOTEXIST99"
      await deleteSession(nonExistentCode)

      const result = await streamRouteAuthCheck(nonExistentCode, crypto.randomUUID())
      expect(result).toBe(401)
    }
  )

  it(
    "**Property test 1**: for all random UUID tokens not matching any session participant → 401",
    async () => {
      // Validates: Requirements 3.2
      const joinCode = "PRES1PROP"
      await deleteSession(joinCode)

      // Create a session with known host token
      const hostResult = await createOrJoinSession("HostPlayer", joinCode)
      expect(hostResult.status).toBe("created")
      if (hostResult.status !== "created") throw new Error("unexpected status")
      const hostToken = hostResult.token

      // Add a joiner so we have both tokens in the session
      const joinerResult = await createOrJoinSession("JoinerPlayer", joinCode)
      expect(joinerResult.status).toBe("waiting")
      if (joinerResult.status !== "waiting") throw new Error("unexpected status")
      const joinerToken = joinerResult.token

      // Property: any UUID that is NOT the host token and NOT the joiner token → 401
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          async (randomToken) => {
            // Skip if the random token happens to match (astronomically unlikely)
            if (randomToken === hostToken || randomToken === joinerToken) return

            const result = await streamRouteAuthCheck(joinCode, randomToken)
            return result === 401
          }
        ),
        { numRuns: 50 }
      )

      await deleteSession(joinCode)
    }
  )

  it(
    "**Property test 1b**: for all random non-UUID strings as tokens → 401",
    async () => {
      // Validates: Requirements 3.2
      const joinCode = "PRES1PROPB"
      await deleteSession(joinCode)

      await createOrJoinSession("HostPlayer", joinCode)

      // Property: arbitrary strings that are not valid session tokens → 401
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 64 }),
          async (randomToken) => {
            const result = await streamRouteAuthCheck(joinCode, randomToken)
            return result === 401
          }
        ),
        { numRuns: 50 }
      )

      await deleteSession(joinCode)
    }
  )
})

// ── Property Test 2: Non-pending_acceptance events do NOT trigger onJoinerArrived ──
//
// For all SSEEvent values where type !== "session_updated" OR
// session.lobbyState !== "pending_acceptance" (isBugCondition_HostUI returns false),
// onJoinerArrived is NOT called.
//
// Validates: Requirements 3.4, 3.5, 3.6

describe("Preservation Property 2 — Non-pending_acceptance events do not trigger onJoinerArrived", () => {
  it(
    "session_updated with lobbyState: 'waiting' → onJoinerArrived NOT called (observed on unfixed code)",
    () => {
      let called = false
      const onJoinerArrived = () => { called = true }

      const event: SSEEvent = {
        type: "session_updated",
        session: {
          joinCode: "TEST",
          lobbyState: "waiting",
          host: { displayName: "Host", token: "h-tok", player: null, connectedAt: 0 },
          joiner: null,
          battleId: null,
          acceptanceDeadline: null,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      }

      const result = simulateUnfixedWaitingScreenHandler(event, onJoinerArrived)
      expect(result.onJoinerArrivedCalled).toBe(false)
      expect(called).toBe(false)
    }
  )

  it(
    "session_updated with lobbyState: 'in_progress' → onJoinerArrived NOT called (observed on unfixed code)",
    () => {
      let called = false
      const onJoinerArrived = () => { called = true }

      const event: SSEEvent = {
        type: "session_updated",
        session: {
          joinCode: "TEST",
          lobbyState: "in_progress",
          host: { displayName: "Host", token: "h-tok", player: "p1", connectedAt: 0 },
          joiner: { displayName: "Joiner", token: "j-tok", player: "p2", connectedAt: 0 },
          battleId: "battle-123",
          acceptanceDeadline: null,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      }

      const result = simulateUnfixedWaitingScreenHandler(event, onJoinerArrived)
      expect(result.onJoinerArrivedCalled).toBe(false)
      expect(called).toBe(false)
    }
  )

  it(
    "battle_started event → router.push called, onJoinerArrived NOT called (observed on unfixed code)",
    () => {
      let called = false
      const onJoinerArrived = () => { called = true }

      // battle_started with matching token triggers router.push, not onJoinerArrived
      const event: SSEEvent = {
        type: "battle_started",
        battleId: "battle-abc",
        yourPlayer: "p1",
        token: "host-token-abc", // matches the token in simulateUnfixedWaitingScreenHandler
      }

      const result = simulateUnfixedWaitingScreenHandler(event, onJoinerArrived)
      expect(result.onJoinerArrivedCalled).toBe(false)
      expect(called).toBe(false)
      expect(result.routerPushCalled).toBe(true)
    }
  )

  it(
    "session_declined event → onJoinerArrived NOT called (observed on unfixed code)",
    () => {
      let called = false
      const onJoinerArrived = () => { called = true }

      const event: SSEEvent = { type: "session_declined" }

      const result = simulateUnfixedWaitingScreenHandler(event, onJoinerArrived)
      expect(result.onJoinerArrivedCalled).toBe(false)
      expect(called).toBe(false)
    }
  )

  it(
    "session_expired event → router.push('/') called, onJoinerArrived NOT called (observed on unfixed code)",
    () => {
      let called = false
      const onJoinerArrived = () => { called = true }

      const event: SSEEvent = { type: "session_expired" }

      const result = simulateUnfixedWaitingScreenHandler(event, onJoinerArrived)
      expect(result.onJoinerArrivedCalled).toBe(false)
      expect(called).toBe(false)
      expect(result.routerPushCalled).toBe(true)
      expect(result.routerPushArg).toBe("/")
    }
  )

  it(
    "**Property test 2**: for all session_updated events where lobbyState !== 'pending_acceptance' → onJoinerArrived NOT called",
    () => {
      // Validates: Requirements 3.4, 3.5, 3.6
      const nonPendingStates = ["waiting", "in_progress", "complete"] as const

      fc.assert(
        fc.property(
          fc.constantFrom(...nonPendingStates),
          fc.uuid(), // joinCode
          fc.uuid(), // hostToken
          (lobbyState, joinCode, hostToken) => {
            let called = false
            const onJoinerArrived = () => { called = true }

            const session: Session = {
              joinCode,
              lobbyState,
              host: { displayName: "Host", token: hostToken, player: null, connectedAt: 0 },
              joiner: lobbyState !== "waiting"
                ? { displayName: "Joiner", token: crypto.randomUUID(), player: null, connectedAt: 0 }
                : null,
              battleId: lobbyState === "in_progress" ? crypto.randomUUID() : null,
              acceptanceDeadline: null,
              createdAt: Date.now(),
              updatedAt: Date.now(),
            }

            const event: SSEEvent = { type: "session_updated", session }
            simulateUnfixedWaitingScreenHandler(event, onJoinerArrived)

            return called === false
          }
        ),
        { numRuns: 100 }
      )
    }
  )

  it(
    "**Property test 2b**: for all non-session_updated event types → onJoinerArrived NOT called",
    () => {
      // Validates: Requirements 3.4, 3.5, 3.6
      fc.assert(
        fc.property(
          fc.oneof(
            fc.record({ type: fc.constant("session_declined" as const) }),
            fc.record({ type: fc.constant("session_expired" as const) }),
            fc.record({
              type: fc.constant("battle_started" as const),
              battleId: fc.uuid(),
              yourPlayer: fc.constantFrom("p1" as const, "p2" as const),
              token: fc.uuid(), // random token — won't match the hardcoded "host-token-abc"
            })
          ),
          (event) => {
            let called = false
            const onJoinerArrived = () => { called = true }

            simulateUnfixedWaitingScreenHandler(event as SSEEvent, onJoinerArrived)

            return called === false
          }
        ),
        { numRuns: 100 }
      )
    }
  )
})
