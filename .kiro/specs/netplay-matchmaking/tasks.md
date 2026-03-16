# Implementation Plan: Netplay Matchmaking

## Overview

Add online multiplayer to the Chroma Battle Simulator. Players find each other via a shared join code. The lobby lifecycle (`waiting` → `pending_acceptance` → `in_progress`) is managed by new Server Actions. Real-time updates are delivered via Server-Sent Events. The existing Battle Engine is unchanged; `submitOrders` gains a session token parameter.

## Tasks

- [x] 1. Extend shared types (`lib/types.ts` + new `lib/matchmaking/types.ts`)
  - Add `LobbyState`, `Session`, `SessionPlayer`, `MatchmakingInput`, and `SSEEvent` types
  - Add `sessionToken` parameter to `submitOrders` signature in `lib/actions.ts`
  - _Requirements: 1.1, 1.4, 2.1, 3.1, 5.1, 6.1, 7.1, 8.2, 8.3_

- [x] 2. Extend SQLite schema — sessions table (`lib/store.ts`)
  - Add `sessions` table migration to `initDb()` in `lib/store.ts`
  - _Requirements: 2.1, 6.4_

- [x] 3. Implement Session Store (`lib/matchmaking/sessionStore.ts`)
  - Implement `saveSession`, `loadSession`, `deleteSession`, `expireStaleWaitingSessions`
  - _Requirements: 2.1, 6.2, 6.4_

  - [x] 3.1 Write unit tests for Session Store
    - Test save/load round-trip for `Session`
    - Test `deleteSession` removes the session
    - Test `expireStaleWaitingSessions` deletes sessions older than the threshold
    - File: `lib/matchmaking/sessionStore.test.ts`

- [x] 4. Implement input validation (`lib/matchmaking/validation.ts`)
  - Implement `validateMatchmakingInput(displayName, joinCode)` — returns `null` on success or `{ field, message }` on failure
  - Rules: display name 1–24 chars, join code 1–16 alphanumeric chars; normalise join code to uppercase
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

  - [x] 4.1 Write property test for Input Validation Rejects Invalid Inputs (Property 1)
    - **Property 1: Input Validation Rejects Invalid Inputs**
    - For any display name or join code that is empty, exceeds its maximum length, or contains non-alphanumeric characters, `validateMatchmakingInput` must return an error and no session must be created or modified.
    - **Validates: Requirements 1.1, 1.2, 1.3, 1.5**
    - File: `lib/matchmaking/actions.test.ts`

  - [x] 4.2 Write property test for Join Code Case Normalisation (Property 2)
    - **Property 2: Join Code Case Normalisation**
    - For any valid alphanumeric join code, the lowercase and uppercase versions must normalise to the same string.
    - **Validates: Requirements 1.4**
    - File: `lib/matchmaking/actions.test.ts`

- [x] 5. Implement Matchmaking Actions (`lib/matchmaking/actions.ts`)
  - Implement `createOrJoinSession(displayName, joinCode)` — validates input, normalises code, creates new session or returns existing state
  - Implement `acceptJoiner(joinCode, hostToken)` — validates host token, transitions to `in_progress`, calls `startBattle()`, publishes `battle_started` SSE event
  - Implement `declineJoiner(joinCode, hostToken)` — validates host token, reverts to `waiting`, publishes `session_declined` SSE event to joiner
  - Implement `cancelJoin(joinCode, joinerToken)` — joiner cancels, reverts session to `waiting`
  - Implement `getSessionState(joinCode, token)` — polling fallback
  - Implement `disconnectFromSession(joinCode, token)` — handles host/joiner disconnect cleanup
  - _Requirements: 2.1, 2.2, 3.1, 3.3, 3.4, 3.5, 4.2, 5.1, 6.1, 6.2, 6.3_

  - [x] 5.1 Write property test for Session Creation on New Code (Property 3)
    - **Property 3: Session Creation on New Code**
    - For any valid display name and join code that does not match an existing session, `createOrJoinSession` must return `status: "created"` and a session with `lobbyState: "waiting"` must exist in the store.
    - **Validates: Requirements 2.1, 2.2**
    - File: `lib/matchmaking/actions.test.ts`

  - [x] 5.2 Write property test for In-Progress Code Is Rejected (Property 4)
    - **Property 4: In-Progress Code Is Rejected**
    - For any session in `lobbyState: "in_progress"`, calling `createOrJoinSession` with that session's join code must return `status: "in_progress"` and must not modify the session.
    - **Validates: Requirements 5.1, 5.2, 5.3**
    - File: `lib/matchmaking/actions.test.ts`

  - [x] 5.3 Write property test for Acceptance Timeout Reverts to Waiting (Property 5)
    - **Property 5: Acceptance Timeout Reverts to Waiting**
    - For any session in `pending_acceptance` whose `acceptanceDeadline` has passed, the session must transition back to `lobbyState: "waiting"` with `joiner` cleared.
    - **Validates: Requirements 3.5**
    - File: `lib/matchmaking/actions.test.ts`

  - [x] 5.4 Write property test for Session Expiry Releases Join Code (Property 6)
    - **Property 6: Session Expiry Releases Join Code**
    - For any session that has been in `lobbyState: "waiting"` for more than 10 minutes, `expireStaleWaitingSessions` must delete that session so the join code becomes available again.
    - **Validates: Requirements 6.4**
    - File: `lib/matchmaking/actions.test.ts`

- [x] 6. Implement SSE Broadcaster (`lib/matchmaking/broadcaster.ts`)
  - Implement in-process pub/sub using Node.js `EventEmitter`
  - Implement `subscribe(sessionId, onEvent)` — returns unsubscribe function
  - Implement `publish(sessionId, event)` — emits to all subscribers for that session
  - _Requirements: 7.1, 7.2_

  - [x] 6.1 Write unit tests for SSE Broadcaster
    - Test that `publish` delivers events to all subscribers for a session
    - Test that unsubscribing stops event delivery
    - Test that events for one session do not reach subscribers of another session
    - File: `lib/matchmaking/broadcaster.test.ts`

- [x] 7. Implement SSE route handlers
  - Create `app/api/lobby/[code]/stream/route.ts` — validates token, subscribes to broadcaster, streams `session_updated` / `battle_started` / `session_declined` / `session_expired` events
  - Create `app/api/battle/[id]/stream/route.ts` — validates token, subscribes to broadcaster, streams `battle_state_updated` events
  - Both routes must set `Content-Type: text/event-stream` and handle client disconnect (unsubscribe)
  - _Requirements: 7.1, 7.2, 7.3_

- [x] 8. Extend `submitOrders` with session token validation (`lib/actions.ts`)
  - Add `sessionToken: string` parameter to `submitOrders`
  - Load the session associated with the battle; verify the token matches the claimed player
  - Return `{ error: "INVALID_TOKEN" }` if token is invalid
  - Return `{ error: "TURN_ALREADY_RESOLVED" }` if orders arrive after resolution has begun
  - Publish `battle_state_updated` SSE event after turn resolution
  - _Requirements: 8.2, 8.3, 8.4, 8.5_

  - [x] 8.1 Write property test for Token Authorisation for Order Submission (Property 7)
    - **Property 7: Token Authorisation for Order Submission**
    - For any battle with two registered player tokens, `submitOrders` called with a token that does not match the claimed player must be rejected and the battle state must remain unchanged.
    - **Validates: Requirements 8.3**
    - File: `lib/matchmaking/actions.test.ts`

  - [x] 8.2 Write property test for Simultaneous Order Resolution (Property 8)
    - **Property 8: Simultaneous Order Resolution**
    - For any battle in the `planning` phase, when both players submit valid orders each with the correct token, `submitOrders` must resolve the turn exactly once and the resulting state must be consistent (all HP ≥ 0, phase advanced).
    - **Validates: Requirements 8.4, 8.5**
    - File: `lib/matchmaking/actions.test.ts`

- [x] 9. Add fast-check arbitraries for matchmaking (`lib/test-utils/arbitraries.ts`)
  - Add `arbitraryDisplayName()` — string 1–24 alphanumeric chars
  - Add `arbitraryJoinCode()` — string 1–16 uppercase alphanumeric chars
  - Add `arbitraryInvalidDisplayName()` — empty string or length > 24
  - Add `arbitraryInvalidJoinCode()` — empty, length > 16, or contains symbols
  - Add `arbitrarySession()` — a `Session` in any `LobbyState`
  - _Requirements: (test infrastructure)_

- [x] 10. Implement UI components
  - [x] 10.1 Create `components/matchmaking/MatchmakingForm.tsx`
    - Display name input (max 24 chars) and join code input (max 16 alphanumeric chars)
    - Client-side validation with distinct error messages per field
    - On submit calls `createOrJoinSession` and routes based on returned status
    - _Requirements: 1.1, 1.2, 1.3, 1.5, 2.2_

  - [x] 10.2 Create `components/matchmaking/WaitingScreen.tsx`
    - "Waiting for opponent…" spinner
    - Connects to `/api/lobby/[code]/stream` SSE; on `session_updated` re-renders; on `battle_started` navigates to `/battle/[id]`
    - Renders `ConnectionStatus` component
    - _Requirements: 2.3, 2.4, 7.1, 7.3_

  - [x] 10.3 Create `components/matchmaking/JoinPrompt.tsx`
    - Displays "[HostName] is waiting to start a battle" with Accept and Change Code buttons
    - Accept calls `joinSession` action; Change Code returns to form with name pre-filled
    - Handles session-no-longer-available case (session transitions away while viewing)
    - _Requirements: 4.1, 4.2, 4.3, 4.4_

  - [x] 10.4 Create `components/matchmaking/AcceptancePrompt.tsx`
    - Displays joiner's display name with Accept and Decline buttons
    - 30-second countdown timer; auto-declines on timeout
    - Accept calls `acceptJoiner`; Decline calls `declineJoiner`
    - _Requirements: 3.2, 3.3, 3.4, 3.5_

  - [x] 10.5 Create `components/matchmaking/WaitingForHost.tsx`
    - Shown to joiner after they accept the lobby
    - Connects to SSE; on `session_declined` shows declined message and returns to form; on `battle_started` navigates to battle
    - _Requirements: 3.4, 7.1_

  - [x] 10.6 Create `components/matchmaking/ConnectionStatus.tsx`
    - Small indicator: "Connected" / "Reconnecting…" / "Connection lost"
    - Accepts `status: "connected" | "reconnecting" | "error"` prop
    - _Requirements: 7.3, 7.4_

- [x] 11. Implement Lobby page (`app/lobby/[code]/page.tsx`)
  - Server Component that loads session state and renders the correct sub-component based on `lobbyState` and the player's token (from cookie/query param)
  - Host in `waiting` → `WaitingScreen`
  - Host in `pending_acceptance` → `AcceptancePrompt`
  - Joiner after joining → `WaitingForHost`
  - `in_progress` → redirect to `/battle/[battleId]`
  - _Requirements: 2.2, 3.2, 4.1_

- [x] 12. Update home page (`app/page.tsx`)
  - Replace or augment the "Start Battle" button with a matchmaking entry form
  - Local pass-n-play option remains available
  - _Requirements: 1.1, 2.1_

- [x] 13. Update `BattleClient` for netplay mode (`app/battle/[id]/BattleClient.tsx`)
  - Accept optional `sessionToken` and `myPlayer` props
  - When `sessionToken` is present, connect to `/api/battle/[id]/stream` SSE for state updates instead of relying on local state
  - Pass `sessionToken` to `submitOrders` calls
  - Render only the current player's planning UI (hide opponent's orders)
  - _Requirements: 7.2, 8.1, 8.2, 8.4_

- [x] 14. Final checkpoint — Ensure all tests pass
  - Run `vitest --run` and verify all matchmaking and battle tests pass
  - Verify full lobby flow end-to-end: create session → join → accept → battle starts → orders submitted → turn resolves

## Notes

- The existing Battle Engine (`lib/engine.ts`) is not modified.
- `lib/store.ts` gains only a schema migration for the `sessions` table; existing functions are unchanged.
- Session tokens are opaque UUIDs issued server-side; they are never derived from user input.
- The SSE broadcaster is in-process (single Next.js server instance). For multi-instance deployments a Redis pub/sub adapter would be needed, but that is out of scope.
- Properties 1–8 each map to exactly one property-based test sub-task (tasks 4.1, 4.2, 5.1–5.4, 8.1, 8.2).
