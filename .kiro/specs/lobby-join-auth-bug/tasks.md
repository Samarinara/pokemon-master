# Implementation Plan

- [x] 1. Write bug condition exploration tests
  - **Property 1: Bug Condition** - Joiner SSE 401 Race & Host UI Not Updating
  - **CRITICAL**: These tests MUST FAIL on unfixed code — failure confirms the bugs exist
  - **DO NOT attempt to fix the tests or the code when they fail**
  - **NOTE**: These tests encode the expected behavior — they will validate the fix when they pass after implementation
  - **GOAL**: Surface counterexamples that demonstrate both bugs before the fix
  - **Scoped PBT Approach**: Scope each property to the concrete failing case to ensure reproducibility
  - Bug 1 — Joiner SSE auth race: call `createOrJoinSession` to obtain a joiner token, then immediately invoke the stream route's auth logic (no delay) — assert it returns 200, not 401 (from isBugCondition_SSE401 in design: `joinerTokenInSession IS NULL AND input.token IS a valid joiner token`)
  - Bug 2a — WaitingScreen callback: simulate a `session_updated` SSE event with `session.lobbyState === "pending_acceptance"` being received by `WaitingScreen` — assert that `onJoinerArrived` is called (from isBugCondition_HostUI in design: `sseEvent.type === "session_updated" AND sseEvent.session.lobbyState === "pending_acceptance" AND currentUIState === "waiting"`)
  - Bug 2b — LobbyClient state transition: render `LobbyClient` with `lobbyState: "waiting"`, fire a `session_updated` event with `pending_acceptance`, assert it renders `AcceptancePrompt` not `WaitingScreen`
  - Run all tests on UNFIXED code
  - **EXPECTED OUTCOME**: Tests FAIL (this is correct — it proves the bugs exist)
  - Document counterexamples found (e.g., "stream route returns 401 for legitimately issued joiner token", "`onJoinerArrived` is never called")
  - Mark task complete when tests are written, run, and failures are documented
  - _Requirements: 1.1, 1.2, 1.3, 1.4_

- [x] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** - Unauthorized Requests Still Rejected & Non-pending_acceptance Events Unaffected
  - **IMPORTANT**: Follow observation-first methodology — observe UNFIXED code behavior for non-buggy inputs first
  - Observe: request with no token → 401 on unfixed code
  - Observe: request with a random token not matching any session participant → 401 on unfixed code
  - Observe: request for a non-existent join code → 401 on unfixed code
  - Observe: `session_updated` event with `lobbyState: "waiting"` received by `WaitingScreen` → `onJoinerArrived` NOT called (prop doesn't exist yet, but the handler does not call any external callback)
  - Observe: `battle_started`, `session_declined`, `session_expired` events → router.push called correctly, no `onJoinerArrived` side-effect
  - Write property-based test: for all tokens that do NOT match any participant in the session (isBugCondition_SSE401 returns false), the stream route returns 401 — generate random UUID tokens and verify rejection
  - Write property-based test: for all SSEEvent values where `type !== "session_updated"` OR `session.lobbyState !== "pending_acceptance"` (isBugCondition_HostUI returns false), `onJoinerArrived` is NOT called
  - Run tests on UNFIXED code
  - **EXPECTED OUTCOME**: Tests PASS (this confirms baseline behavior to preserve)
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

- [x] 3. Fix lobby join auth bugs

  - [x] 3.1 Add retry loop to stream route auth (`app/api/lobby/[code]/stream/route.ts`)
    - Replace the single `loadSession(code)` call (after the token null-check) with a retry loop: attempt `loadSession(code)` up to 3 times, waiting 100 ms between attempts, before concluding the session is not found or the token is invalid
    - Keep the token comparison logic identical: `session.host.token !== token && session.joiner?.token !== token`
    - If after all 3 retries the session is still not found or the token still doesn't match, return 401 as before — no change to rejection behavior
    - _Bug_Condition: isBugCondition_SSE401(input) where `joinerTokenInSession IS NULL AND input.token IS a valid joiner token` (write not yet visible at request time)_
    - _Expected_Behavior: stream route returns 200 SSE response for any legitimately issued joiner token_
    - _Preservation: no-token, wrong-token, and unknown-code requests MUST still return 401_
    - _Requirements: 2.1, 2.2, 3.1, 3.2, 3.3_

  - [x] 3.2 Add `onJoinerArrived` callback to `WaitingScreen` (`components/matchmaking/WaitingScreen.tsx`)
    - Add optional prop `onJoinerArrived?: () => void` to `WaitingScreenProps`
    - In the `onmessage` handler, when `event.type === "session_updated"` and `event.session.lobbyState === "pending_acceptance"`, call `onJoinerArrived?.()`
    - All other event handling (`battle_started`, `session_expired`, other `session_updated` states) remains unchanged
    - _Bug_Condition: isBugCondition_HostUI(input) where `sseEvent.type === "session_updated" AND sseEvent.session.lobbyState === "pending_acceptance" AND currentUIState === "waiting"`_
    - _Expected_Behavior: `onJoinerArrived` is called, enabling LobbyClient to transition to AcceptancePrompt_
    - _Preservation: non-pending_acceptance session_updated events and all other SSE event types MUST NOT trigger onJoinerArrived_
    - _Requirements: 2.3, 2.4, 3.4, 3.5, 3.6_

  - [x] 3.3 Lift `lobbyState` into `LobbyClient` state and wire `onJoinerArrived` (`app/lobby/[code]/LobbyClient.tsx`)
    - Add `const [currentLobbyState, setCurrentLobbyState] = useState(session.lobbyState)`
    - Pass `onJoinerArrived={() => setCurrentLobbyState("pending_acceptance")}` to `WaitingScreen`
    - Replace `lobbyState` with `currentLobbyState` in the render condition that selects between `AcceptancePrompt` and `WaitingScreen`
    - _Bug_Condition: isBugCondition_HostUI — LobbyClient renders based on static prop, never re-renders on SSE event_
    - _Expected_Behavior: host UI transitions to AcceptancePrompt in real time when onJoinerArrived fires_
    - _Preservation: all other LobbyClient render paths (joiner view, post-decline showWaiting) remain unchanged_
    - _Requirements: 2.3, 2.4_

  - [x] 3.4 Verify bug condition exploration tests now pass
    - **Property 1: Expected Behavior** - Joiner SSE Authenticates & Host UI Transitions
    - **IMPORTANT**: Re-run the SAME tests from task 1 — do NOT write new tests
    - The tests from task 1 encode the expected behavior; passing confirms the bugs are fixed
    - Run all three exploration tests (SSE auth race, WaitingScreen callback, LobbyClient transition)
    - **EXPECTED OUTCOME**: All tests PASS (confirms both bugs are fixed)
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

  - [x] 3.5 Verify preservation tests still pass
    - **Property 2: Preservation** - Unauthorized Requests Still Rejected & Non-pending_acceptance Events Unaffected
    - **IMPORTANT**: Re-run the SAME tests from task 2 — do NOT write new tests
    - Run all preservation property tests from step 2
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions in auth rejection or unrelated event handling)
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

- [x] 4. Checkpoint — Ensure all tests pass
  - Run the full test suite (`pnpm vitest --run`)
  - Ensure all tests pass; ask the user if any questions arise
