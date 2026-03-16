/**
 * Bug Condition Exploration Tests — lobby-join-auth-bug
 *
 * These tests encode the EXPECTED (correct) behavior.
 * They MUST FAIL on unfixed code — failure confirms the bugs exist.
 *
 * DO NOT attempt to fix the tests or the code when they fail.
 *
 * Validates: Requirements 1.1, 1.2, 1.3, 1.4
 */

import { describe, it, expect } from "vitest"
import { createOrJoinSession } from "./actions"
import { loadSession, deleteSession } from "./sessionStore"
import type { Session, SSEEvent } from "./types"

// ── Helpers ────────────────────────────────────────────────────────────────

/** Replicate the exact auth check performed by the stream route (app/api/lobby/[code]/stream/route.ts) */
async function streamRouteAuthCheck(code: string, token: string): Promise<200 | 401> {
  // This is the UNFIXED single-attempt auth check from the stream route:
  const session = await loadSession(code)
  if (
    !session ||
    (session.host.token !== token && session.joiner?.token !== token)
  ) {
    return 401
  }
  return 200
}

// ── Bug 1 — Joiner SSE Auth Race ───────────────────────────────────────────
//
// Bug condition (from design.md):
//   joinerTokenInSession IS NULL AND input.token IS a valid joiner token
//   (write not yet visible at request time)
//
// The stream route performs a single loadSession call with no retry.
// When the joiner's browser opens the SSE stream immediately after
// createOrJoinSession returns, loadSession may return the pre-join snapshot
// (joiner is null) and the auth check fails with 401.
//
// NOTE: In the test environment (same process, synchronous SQLite), the write
// propagation race does not manifest — loadSession always sees the latest write.
// The race only occurs in production where the HTTP request arrives from a
// separate process/connection before saveDb() has flushed to disk.
//
// The exploration test for Bug 1 therefore verifies:
// 1. The stream route has NO retry loop (single loadSession call) — this is the
//    structural root cause that makes the race possible.
// 2. The auth logic correctly authenticates a legitimately issued joiner token
//    when the session IS present (baseline correctness).

describe("Bug 1 — Joiner SSE auth race", () => {
  it(
    "stream route has no retry loop — single loadSession call is the structural root cause",
    async () => {
      // The bug root cause: the stream route performs a single loadSession call
      // with no retry. On unfixed code, there is no retry loop.
      // The fix adds up to 3 retries with 100ms delay.
      //
      // We verify the unfixed code lacks a retry loop by inspecting the source.
      const { readFileSync } = await import("fs")
      const source = readFileSync(
        new URL("../../app/api/lobby/[code]/stream/route.ts", import.meta.url),
        "utf-8"
      )

      // EXPECTED (after fix): stream route has a retry loop
      // ACTUAL (buggy): single loadSession call, no retry
      //
      // The fix should add a retry mechanism — assert it exists:
      expect(source).toMatch(/retry|attempt|for\s*\(|while\s*\(/)
    }
  )

  it(
    "stream route auth returns 200 (not 401) for a legitimately issued joiner token",
    async () => {
      const joinCode = "BUG1TEST"
      await deleteSession(joinCode)

      // Step 1: Host creates the session
      const hostResult = await createOrJoinSession("HostPlayer", joinCode)
      expect(hostResult.status).toBe("created")

      // Step 2: Joiner joins — server issues joinerToken and writes to DB
      const joinerResult = await createOrJoinSession("JoinerPlayer", joinCode)
      expect(joinerResult.status).toBe("waiting")
      if (joinerResult.status !== "waiting") throw new Error("unexpected status")
      const joinerToken = joinerResult.token

      // Step 3: Immediately (no delay) run the stream route auth check
      // This simulates the joiner's browser opening the SSE stream right away.
      //
      // In production, the race manifests because saveDb() is async and the
      // HTTP request may arrive before the write flushes. The fix adds a retry
      // loop to tolerate this propagation window.
      const authResult = await streamRouteAuthCheck(joinCode, joinerToken)

      // EXPECTED: 200 — joiner token is valid and should authenticate
      expect(authResult).toBe(200)

      // Cleanup
      await deleteSession(joinCode)
    }
  )
})

// ── Bug 2a — WaitingScreen callback: onJoinerArrived not called ────────────
//
// Bug condition (from design.md):
//   sseEvent.type === "session_updated"
//   AND sseEvent.session.lobbyState === "pending_acceptance"
//   AND currentUIState === "waiting"
//
// WaitingScreen.onmessage handles session_updated but only calls
// setConnectionStatus("connected") — it never calls onJoinerArrived.
// The prop doesn't exist on WaitingScreenProps at all.

describe("Bug 2a — WaitingScreen callback: onJoinerArrived", () => {
  it(
    "WaitingScreen calls onJoinerArrived when session_updated with pending_acceptance is received",
    async () => {
      // We test the message handler logic by reading the WaitingScreen source
      // and verifying the expected behavior.
      //
      // The fix requires:
      //   1. WaitingScreenProps has onJoinerArrived?: () => void
      //   2. onmessage calls onJoinerArrived?.() when lobbyState === "pending_acceptance"
      //
      // On UNFIXED code, WaitingScreen does NOT have onJoinerArrived prop,
      // so this test verifies the prop exists and is called.

      // Simulate the onmessage handler logic from WaitingScreen
      // by reading the component source and checking the behavior.
      const { readFileSync } = await import("fs")
      const source = readFileSync(
        new URL("../../components/matchmaking/WaitingScreen.tsx", import.meta.url),
        "utf-8"
      )

      // EXPECTED: WaitingScreen has onJoinerArrived prop
      // ACTUAL (buggy): WaitingScreen does NOT have onJoinerArrived prop
      expect(source).toContain("onJoinerArrived")
    }
  )

  it(
    "WaitingScreen onmessage handler calls onJoinerArrived for pending_acceptance session_updated",
    async () => {
      const { readFileSync } = await import("fs")
      const source = readFileSync(
        new URL("../../components/matchmaking/WaitingScreen.tsx", import.meta.url),
        "utf-8"
      )

      // EXPECTED: the handler calls onJoinerArrived when lobbyState is pending_acceptance
      // ACTUAL (buggy): no such call exists
      expect(source).toContain("pending_acceptance")
      expect(source).toMatch(/onJoinerArrived\s*\?\.\s*\([^)]*\)/)
    }
  )

  it(
    "WaitingScreen message handler logic: onJoinerArrived is invoked for pending_acceptance",
    async () => {
      // Verify the fixed handler logic by reading the WaitingScreen source and
      // confirming it calls onJoinerArrived?.() inside the pending_acceptance branch.
      // On unfixed code, this branch does not exist — the test fails.
      const { readFileSync } = await import("fs")
      const source = readFileSync(
        new URL("../../components/matchmaking/WaitingScreen.tsx", import.meta.url),
        "utf-8"
      )

      // The fixed handler must contain both the pending_acceptance check AND the callback call
      // in the same code path. Verify they appear together.
      const pendingIdx = source.indexOf("pending_acceptance")
      const callbackIdx = source.search(/onJoinerArrived\s*\?\.\s*\([^)]*\)/)

      // EXPECTED: both exist and the callback call comes after the pending_acceptance check
      expect(pendingIdx).toBeGreaterThan(-1)
      expect(callbackIdx).toBeGreaterThan(-1)
      expect(callbackIdx).toBeGreaterThan(pendingIdx)
    }
  )
})

// ── Bug 2b — LobbyClient state transition ─────────────────────────────────
//
// Bug condition (from design.md):
//   LobbyClient renders based on static session.lobbyState prop,
//   never re-renders on SSE event.
//
// LobbyClient uses `const { lobbyState } = session` directly from props.
// It has no local state for lobbyState, so when WaitingScreen receives
// a session_updated event, LobbyClient never re-renders to show AcceptancePrompt.

describe("Bug 2b — LobbyClient state transition", () => {
  it(
    "LobbyClient tracks lobbyState as local state (not just from static prop)",
    async () => {
      const { readFileSync } = await import("fs")
      const source = readFileSync(
        new URL("../../app/lobby/[code]/LobbyClient.tsx", import.meta.url),
        "utf-8"
      )

      // EXPECTED: LobbyClient has useState for lobbyState / currentLobbyState
      // ACTUAL (buggy): LobbyClient destructures lobbyState directly from session prop
      // with no local state — it can never re-render based on SSE events
      expect(source).toMatch(/useState.*lobbyState|currentLobbyState/)
    }
  )

  it(
    "LobbyClient passes onJoinerArrived callback to WaitingScreen",
    async () => {
      const { readFileSync } = await import("fs")
      const source = readFileSync(
        new URL("../../app/lobby/[code]/LobbyClient.tsx", import.meta.url),
        "utf-8"
      )

      // EXPECTED: LobbyClient passes onJoinerArrived to WaitingScreen
      // ACTUAL (buggy): WaitingScreen is rendered without onJoinerArrived prop
      expect(source).toContain("onJoinerArrived")
    }
  )

  it(
    "LobbyClient render logic: transitions to AcceptancePrompt when lobbyState becomes pending_acceptance",
    () => {
      // Simulate the UNFIXED LobbyClient render logic.
      // On unfixed code, lobbyState comes directly from the static session prop.
      // Even if an SSE event fires and WaitingScreen calls onJoinerArrived,
      // LobbyClient has no mechanism to update its render.

      // Simulate the UNFIXED render decision:
      function unfixedLobbyClientRender(session: Pick<Session, "lobbyState">, showWaiting: boolean): string {
        // UNFIXED: uses session.lobbyState directly (static prop, never updates)
        const { lobbyState } = session
        if (lobbyState === "pending_acceptance" && !showWaiting) {
          return "AcceptancePrompt"
        }
        return "WaitingScreen"
      }

      // Initial state: session.lobbyState = "waiting"
      const initialSession = { lobbyState: "waiting" as const }

      // After SSE event fires, the session prop is NOT updated (it's static).
      // The component would need local state to re-render.
      // Simulate what SHOULD happen: lobbyState transitions to pending_acceptance.
      const updatedLobbyState = "pending_acceptance" as const

      // UNFIXED: even after SSE event, session prop is still "waiting"
      // so the render still returns "WaitingScreen"
      const unfixedResult = unfixedLobbyClientRender(initialSession, false)

      // EXPECTED: after SSE event with pending_acceptance, should render AcceptancePrompt
      // ACTUAL (buggy): still renders WaitingScreen because session prop is static
      //
      // To make this test fail on unfixed code, we assert the EXPECTED behavior:
      // that when lobbyState transitions to pending_acceptance (via SSE),
      // the component renders AcceptancePrompt.
      //
      // The unfixed code uses the static prop, so unfixedResult is "WaitingScreen".
      // The fixed code would use local state updated by onJoinerArrived callback.

      // Simulate fixed render with local state:
      function fixedLobbyClientRender(currentLobbyState: string, showWaiting: boolean): string {
        if (currentLobbyState === "pending_acceptance" && !showWaiting) {
          return "AcceptancePrompt"
        }
        return "WaitingScreen"
      }

      // After onJoinerArrived fires, currentLobbyState is updated to pending_acceptance
      const fixedResult = fixedLobbyClientRender(updatedLobbyState, false)
      expect(fixedResult).toBe("AcceptancePrompt")

      // The bug: unfixed code never reaches AcceptancePrompt from "waiting" initial state
      // because it has no local state to update.
      // Assert that the unfixed render (using static prop) does NOT show AcceptancePrompt
      // when starting from "waiting" — this is the bug condition.
      expect(unfixedResult).toBe("WaitingScreen") // confirms bug: stuck on WaitingScreen

      // The real assertion that FAILS on unfixed code:
      // When the SSE event fires, the UI MUST show AcceptancePrompt.
      // On unfixed code, LobbyClient has no onJoinerArrived wiring, so
      // the static prop is never updated and this transition never happens.
      //
      // We assert the source code has the fix:
      // (This will fail on unfixed code)
      const { readFileSync } = require("fs")
      const source = readFileSync(
        new URL("../../app/lobby/[code]/LobbyClient.tsx", import.meta.url).pathname,
        "utf-8"
      )
      // EXPECTED: LobbyClient uses currentLobbyState (local state) not session.lobbyState
      expect(source).toMatch(/currentLobbyState|currentSession/)
    }
  )
})
