# Lobby Join Auth Bug — Bugfix Design

## Overview

Two related bugs prevent the lobby joining flow from working without manual intervention:

1. **Joiner SSE 401**: After `createOrJoinSession` returns the joiner's token, the browser immediately opens an SSE stream at `/api/lobby/[code]/stream?token=[joinerToken]`. The stream route calls `loadSession(code)` to validate the token, but the SQLite write initiated by `saveSession` + `saveDb()` may not have completed by the time the stream request arrives, causing the session lookup to return the pre-join snapshot (no joiner token) and the auth check to fail with 401.

2. **Host UI not updating**: `WaitingScreen` receives `session_updated` SSE events but only calls `setConnectionStatus("connected")` — it never signals `LobbyClient` to switch from `WaitingScreen` to `AcceptancePrompt`. `LobbyClient` renders based on the static `session` prop passed at page load, so the host UI is stuck on the waiting spinner until a manual refresh.

The fix for Bug 1 is to add a short retry loop in the stream auth check to tolerate the write propagation delay. The fix for Bug 2 is to lift lobby-state tracking into `LobbyClient` (or `WaitingScreen`) so that an incoming `session_updated` event with `lobbyState === "pending_acceptance"` causes the host UI to re-render with `AcceptancePrompt`.

## Glossary

- **Bug_Condition (C)**: The set of inputs/states that trigger either defect — a joiner token that is not yet visible to the stream auth check, or a `session_updated` event that does not cause the host UI to re-render.
- **Property (P)**: The desired correct behavior — the joiner's SSE stream authenticates successfully and the host UI transitions to `AcceptancePrompt` in real time.
- **Preservation**: All existing auth rejection behavior (no token, wrong token, unknown code) and all downstream lobby actions (accept, decline, cancel, battle start) must remain unchanged.
- **`loadSession(code)`**: Function in `lib/matchmaking/sessionStore.ts` that reads a session row from SQLite by join code.
- **`saveDb()`**: Persists the in-memory SQLite database to disk; called after every `saveSession` write.
- **`WaitingScreen`**: Host-side React component in `components/matchmaking/WaitingScreen.tsx` that opens the SSE stream and renders the waiting spinner.
- **`LobbyClient`**: Client component in `app/lobby/[code]/LobbyClient.tsx` that selects which UI to render based on `session.lobbyState` and `role`.
- **`lobbyState`**: The `Session.lobbyState` field — one of `"waiting"`, `"pending_acceptance"`, `"in_progress"`, `"complete"`.

## Bug Details

### Bug Condition

**Bug 1 — Joiner SSE 401 (write propagation race):**

The bug manifests when the joiner's browser opens the SSE stream immediately after `createOrJoinSession` returns. The stream auth reads the session from SQLite before the write has been flushed, so `session.joiner` is still `null` and the token check fails.

**Formal Specification:**
```
FUNCTION isBugCondition_SSE401(input)
  INPUT: input = { code: string, token: string, requestTimestamp: number }
  OUTPUT: boolean

  sessionAtRequestTime := loadSession(input.code)   // may be stale
  joinerTokenInSession  := sessionAtRequestTime?.joiner?.token

  RETURN input.token IS NOT NULL
         AND joinerTokenInSession IS NULL             // write not yet visible
         AND input.token IS a valid joiner token      // token was legitimately issued
END FUNCTION
```

**Bug 2 — Host UI not updating (missing state propagation):**

The bug manifests when `WaitingScreen` receives a `session_updated` event but does not propagate the new `lobbyState` to `LobbyClient`.

```
FUNCTION isBugCondition_HostUI(input)
  INPUT: input = { sseEvent: SSEEvent, currentUIState: "waiting" | "pending_acceptance" }
  OUTPUT: boolean

  RETURN input.sseEvent.type === "session_updated"
         AND input.sseEvent.session.lobbyState === "pending_acceptance"
         AND input.currentUIState === "waiting"   // UI has not transitioned
END FUNCTION
```

### Examples

**Bug 1:**
- Joiner submits form → server issues `joinerToken` → browser opens SSE stream ~5 ms later → `loadSession` returns pre-join row (joiner is null) → 401 returned → joiner never receives host decision

**Bug 2:**
- Host is on `WaitingScreen` → joiner submits form → server publishes `session_updated` with `lobbyState: "pending_acceptance"` → `WaitingScreen.onmessage` fires → only `setConnectionStatus("connected")` is called → `LobbyClient` still renders `WaitingScreen` → host never sees `AcceptancePrompt`

**Preserved (not a bug):**
- Request with no token → 401 (correct)
- Request with a token that belongs to a different session → 401 (correct)
- Request for a non-existent join code → 401 (correct)

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- Requests with no `token` query parameter MUST continue to return 401
- Requests with a token that does not match any participant in the session MUST continue to return 401
- Requests for a join code with no corresponding session MUST continue to return 401
- Host declining a joiner MUST continue to notify the joiner via SSE and revert session to `waiting`
- Host accepting a joiner MUST continue to start a battle and redirect both participants
- Joiner cancelling MUST continue to revert the session to `waiting` and notify the host
- All existing SSE event types (`session_declined`, `battle_started`, `session_expired`) MUST continue to be delivered correctly

**Scope:**
All inputs that do NOT involve the joiner's first SSE connection attempt or the host's `session_updated` handler are completely unaffected by this fix. This includes:
- Host SSE stream authentication (host token is written before the stream is opened)
- Mouse/form interactions on the lobby page
- Battle flow after `battle_started` is received

## Hypothesized Root Cause

**Bug 1 — Joiner SSE 401:**

1. **Write propagation delay**: `saveSession` calls `db.run(...)` followed by `saveDb()`. `saveDb()` serializes the in-memory SQLite database to disk asynchronously. The stream route's `loadSession` call may execute before the write is committed, returning the pre-join session row where `joiner` is `null`.

2. **No retry in stream auth**: The stream route performs a single `loadSession` call with no tolerance for transient staleness. A short retry loop (e.g., 3 attempts × 100 ms) would bridge the propagation window.

**Bug 2 — Host UI not updating:**

3. **Missing state lift in WaitingScreen**: `WaitingScreen` handles `session_updated` but only updates `connectionStatus`. It has no mechanism to tell `LobbyClient` to switch to `AcceptancePrompt`. The fix requires either: (a) adding an `onSessionUpdated` callback prop to `WaitingScreen` that `LobbyClient` uses to update its own state, or (b) moving the SSE connection logic into `LobbyClient` directly and having it manage `lobbyState` as local state.

## Correctness Properties

Property 1: Bug Condition — Joiner SSE Stream Authenticates Successfully

_For any_ SSE stream request where the token was legitimately issued by `createOrJoinSession` for the given join code (isBugCondition_SSE401 returns true), the fixed stream route SHALL authenticate the request successfully and return a 200 SSE response, not a 401.

**Validates: Requirements 2.1, 2.2**

Property 2: Bug Condition — Host UI Transitions on session_updated

_For any_ `session_updated` SSE event where `session.lobbyState === "pending_acceptance"` received by the host's SSE connection (isBugCondition_HostUI returns true), the fixed host UI SHALL render the `AcceptancePrompt` component without requiring a page refresh.

**Validates: Requirements 2.3, 2.4**

Property 3: Preservation — Unauthorized Requests Still Rejected

_For any_ SSE stream request where the token is absent, invalid, or does not match any participant in the session (isBugCondition_SSE401 returns false), the fixed stream route SHALL continue to return 401 Unauthorized, identical to the original behavior.

**Validates: Requirements 3.1, 3.2, 3.3**

Property 4: Preservation — Downstream Lobby Actions Unaffected

_For any_ lobby action (accept, decline, cancel, battle start) that does not involve the joiner's first SSE connection or the host's `session_updated` handler, the fixed code SHALL produce exactly the same behavior as the original code.

**Validates: Requirements 3.4, 3.5, 3.6**

## Fix Implementation

### Changes Required

**Fix 1 — Stream auth retry loop**

**File**: `app/api/lobby/[code]/stream/route.ts`

**Function**: `GET`

**Specific Changes**:
1. **Replace single `loadSession` call with retry loop**: After the token null-check, attempt `loadSession(code)` up to 3 times with a 100 ms delay between attempts before concluding the session is not found or the token is invalid.
2. **Auth logic unchanged**: The token comparison (`session.host.token !== token && session.joiner?.token !== token`) remains identical — only the number of attempts changes.
3. **No change to 401 responses for genuinely invalid requests**: If after all retries the session is still not found or the token still doesn't match, return 401 as before.

---

**Fix 2 — Host UI state propagation**

**File**: `components/matchmaking/WaitingScreen.tsx`

**Specific Changes**:
1. **Add `onJoinerArrived` callback prop**: Add an optional `onJoinerArrived?: () => void` prop to `WaitingScreenProps`.
2. **Call callback on `session_updated` with `pending_acceptance`**: In the `onmessage` handler, when `event.type === "session_updated"` and `event.session.lobbyState === "pending_acceptance"`, call `onJoinerArrived?.()`.

**File**: `app/lobby/[code]/LobbyClient.tsx`

**Specific Changes**:
1. **Track `lobbyState` as local state**: Add `const [currentLobbyState, setCurrentLobbyState] = useState(session.lobbyState)`.
2. **Pass `onJoinerArrived` to `WaitingScreen`**: Pass `onJoinerArrived={() => setCurrentLobbyState("pending_acceptance")}`.
3. **Use `currentLobbyState` instead of `session.lobbyState`** in the render condition for `AcceptancePrompt` vs `WaitingScreen`.

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, surface counterexamples that demonstrate each bug on unfixed code, then verify the fix works correctly and preserves existing behavior.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate both bugs BEFORE implementing the fix. Confirm or refute the root cause analysis.

**Test Plan**: Write tests that simulate the race condition (Bug 1) and the SSE event handling path (Bug 2). Run these tests on the UNFIXED code to observe failures.

**Test Cases**:
1. **Joiner SSE auth race test**: Call `createOrJoinSession` to get a joiner token, then immediately call the stream route's auth logic (without any delay) — assert it returns 200. (Will fail on unfixed code if the write hasn't propagated.)
2. **Host UI session_updated test**: Simulate a `session_updated` event with `lobbyState: "pending_acceptance"` being received by `WaitingScreen` — assert that `onJoinerArrived` is called. (Will fail on unfixed code because the callback doesn't exist.)
3. **LobbyClient state transition test**: Render `LobbyClient` with `lobbyState: "waiting"`, fire a `session_updated` event, assert it renders `AcceptancePrompt`. (Will fail on unfixed code.)
4. **Immediate stream open test**: Open the SSE stream within 1 ms of `saveSession` completing — assert 200, not 401. (May fail on unfixed code depending on timing.)

**Expected Counterexamples**:
- Stream route returns 401 for a legitimately issued joiner token when the request arrives before the write propagates
- `WaitingScreen` does not call any callback when `session_updated` with `pending_acceptance` is received

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed code produces the expected behavior.

**Pseudocode:**
```
FOR ALL input WHERE isBugCondition_SSE401(input) DO
  result := streamRoute_fixed(input)
  ASSERT result.status === 200
END FOR

FOR ALL input WHERE isBugCondition_HostUI(input) DO
  result := WaitingScreen_fixed.handleSSEEvent(input.sseEvent)
  ASSERT onJoinerArrived WAS CALLED
END FOR
```

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the fixed code produces the same result as the original.

**Pseudocode:**
```
FOR ALL input WHERE NOT isBugCondition_SSE401(input) DO
  ASSERT streamRoute_original(input) = streamRoute_fixed(input)
END FOR

FOR ALL input WHERE NOT isBugCondition_HostUI(input) DO
  ASSERT WaitingScreen_original.handleSSEEvent(input) = WaitingScreen_fixed.handleSSEEvent(input)
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation checking because:
- It generates many token/session combinations automatically
- It catches edge cases (empty token, token from different session, expired session) that manual tests might miss
- It provides strong guarantees that the retry loop never incorrectly accepts an invalid token

**Test Plan**: Observe behavior on UNFIXED code for invalid-token requests, then write property-based tests capturing that behavior.

**Test Cases**:
1. **No-token preservation**: Verify requests with no token still return 401 after fix
2. **Wrong-token preservation**: Generate random tokens not matching any session participant — verify 401 is still returned
3. **Unknown-code preservation**: Verify requests for non-existent join codes still return 401
4. **Non-pending_acceptance event preservation**: Verify `session_updated` events with other `lobbyState` values do not trigger `onJoinerArrived`
5. **battle_started / session_declined / session_expired preservation**: Verify these event handlers are unaffected by the fix

### Unit Tests

- Test stream route auth with a valid joiner token issued immediately before the request
- Test stream route auth with no token, wrong token, and unknown code
- Test `WaitingScreen` calls `onJoinerArrived` when `session_updated` with `pending_acceptance` is received
- Test `WaitingScreen` does NOT call `onJoinerArrived` for other event types
- Test `LobbyClient` transitions from `WaitingScreen` to `AcceptancePrompt` when `onJoinerArrived` fires

### Property-Based Tests

- Generate random tokens and verify the retry loop never accepts a token that doesn't match the session
- Generate random `SSEEvent` values and verify only `session_updated` + `pending_acceptance` triggers the UI transition
- Generate random sequences of lobby actions and verify the session state machine remains consistent after the fix

### Integration Tests

- Full join flow: joiner submits form → SSE stream opens immediately → host sees `AcceptancePrompt` in real time → host accepts → both redirect to battle
- Decline flow: joiner submits form → host sees `AcceptancePrompt` → host declines → joiner receives `session_declined` → both return to waiting/home
- Invalid auth: request with wrong token → 401 (unchanged)
