# Implementation Plan: Turn Resolution Animation

## Overview

Implement the turn resolution animation screen by building a pure `buildSnapshots` function, a presentational `ActionAnnouncement` component, a full `ResolutionScreen` with beat sequencer, and wiring it into `BattleClient`.

## Tasks

- [x] 1. Implement `lib/snapshots.ts` — `applySingleAction` and `buildSnapshots`
  - Create `lib/snapshots.ts` exporting `applySingleAction(state, action, originalPreState)` that mirrors the body of `resolveTurn`'s inner loop for a single `ResolvedAction`, using `originalPreState` to look up defender orders for block resolution
  - Export `buildSnapshots(preState: BattleState): BattleState[]` that iterates `preState.resolutionQueue`, calls `applySingleAction` for each entry, and returns the array of intermediate snapshots (one per action, each reflecting state *after* that action)
  - Return `[]` immediately when `resolutionQueue` is empty
  - Skip actions where the acting bird has already fainted (matching engine skip logic)
  - _Requirements: 6.1, 6.3, 6.4_

  - [x] 1.1 Write property test — Property 1: `buildSnapshots` round-trip
    - **Property 1: buildSnapshots round-trip**
    - Add `arbPrePostStatePair()` to `lib/test-utils/arbitraries.ts` that generates a random planning-phase `BattleState` with a non-empty `resolutionQueue` and runs `resolveTurn` with a seeded RNG to produce the matching `postState`
    - Assert `snapshots[snapshots.length - 1].p1Field`, `.p2Field`, and `.battleLog` equal `postState`'s corresponding fields
    - **Validates: Requirements 6.3, 6.4**

  - [x] 1.2 Write property test — Property 2: beat sequence matches resolution queue order
    - **Property 2: Beat sequence matches resolution queue order**
    - Use `arbitraryBattleState()` extended with a non-empty `resolutionQueue`
    - Assert `buildSnapshots(preState).length === preState.resolutionQueue.length`
    - **Validates: Requirements 2.1**

  - [x] 1.3 Write property test — Property 4: log accumulation is monotone
    - **Property 4: Log accumulation is monotone**
    - For each snapshot index `k`, assert that the current-turn log entries in `snapshots[k]` are a prefix of the current-turn log entries in the final snapshot
    - **Validates: Requirements 4.1, 4.2**

- [x] 2. Checkpoint — verify `buildSnapshots` unit tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 3. Implement `components/battle/ActionAnnouncement.tsx`
  - Create a presentational component accepting `{ action: ResolvedAction, preSnapshot: BattleState, postSnapshot: BattleState, beatPhase: BeatPhase }`
  - Export the `BeatPhase` union type (`"announce" | "animating" | "result" | "pausing" | "reversal" | "done"`) from this file or a shared location
  - Derive display text by diffing `preSnapshot` and `postSnapshot`: acting bird name, action type, move name + target name for attacks, miss/crit/switch/block indicators
  - Show "Missed!" when target HP is unchanged and the log entry contains "missed"
  - Show "Critical Hit!" when the log entry contains "Critical hit!"
  - Show outgoing/incoming bird names for switch actions
  - Show blocking bird name and height for block actions
  - _Requirements: 2.2, 2.4, 2.5, 2.6, 2.7_

  - [x] 3.1 Write property test — Property 3: beat announcement contains required fields
    - **Property 3: Beat announcement contains required fields**
    - Extract a pure `formatAnnouncement(action, preSnapshot, postSnapshot)` helper from `ActionAnnouncement` and test it directly
    - Assert the result contains the acting bird's name and, for attack orders, the move name
    - **Validates: Requirements 2.2**

- [x] 4. Implement `components/battle/ResolutionScreen.tsx`
  - [x] 4.1 Scaffold component with props, internal state, and snapshot memoisation
    - Accept `{ preState: BattleState, postState: BattleState, onComplete: () => void }`
    - Call `buildSnapshots(preState)` once via `useMemo`
    - Call `onComplete()` immediately in a `useEffect` when the snapshot array is empty
    - Initialise `AnimState`: `{ beatIndex: 0, beatPhase: "announce", currentSnapshot: preState, visibleLogEntries: [] }`
    - _Requirements: 1.1, 1.3, 6.1, 6.2_

  - [x] 4.2 Implement beat sequencer with `useEffect` + `setTimeout`
    - Advance through `beatPhase` states (`announce → animating → result → pausing → reversal → done`) using the timing table from the design: announce 300ms, animating 300ms (0ms for miss/block/switch), result 500ms (miss/switch only), pausing 400ms, reversal 1000ms (only when `reversalWindow` non-null)
    - Detect `prefers-reduced-motion` via `window.matchMedia` and collapse all durations to 0ms when active
    - Advance `beatIndex` after `pausing`; call `onComplete` after the last beat's `pausing` phase
    - Append the beat's `LogEntry` items to `visibleLogEntries` when transitioning out of `result`/`pausing`
    - _Requirements: 2.1, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 4.2, 5.2, 7.4_

  - [x] 4.3 Render six `BirdCard` panels driven by `currentSnapshot`
    - Render p1 left, p1 right, p1 bench, p2 left, p2 right, p2 bench using `<BirdCard instance={...} />`
    - Pass the `BirdInstance` values from `currentSnapshot` so HP/Spirit bars animate via the existing `transition-all` CSS on `BirdCard`
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

  - [x] 4.4 Render `ActionAnnouncement`, log panel, reversal indicator, and skip button
    - Render `<ActionAnnouncement>` for the current beat using `preSnapshot` (previous snapshot or `preState`) and `postSnapshot` (`snapshots[beatIndex]`)
    - Render a scrollable log panel showing `visibleLogEntries`; auto-scroll to bottom after each append using a `useEffect` + `ref`
    - Render a reversal window indicator when `currentSnapshot.reversalWindow` is non-null; show it as expired (greyed out) after the reversal phase ends
    - Render a skip button labelled "Skip" that is keyboard-focusable (native `<button>`); on activation, flush all remaining log entries to `visibleLogEntries` and call `onComplete`
    - _Requirements: 1.4, 4.1, 4.2, 4.3, 4.4, 5.1, 5.2, 5.3, 7.2, 7.3_

  - [x] 4.5 Apply responsive layout
    - Layout renders correctly at 320px–1920px viewport widths
    - Bird card panels arranged in two rows (p1 team / p2 team) or a grid that reflows on narrow viewports
    - _Requirements: 7.1_

- [x] 5. Checkpoint — verify ResolutionScreen renders and skip works
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Wire `ResolutionScreen` into `BattleClient`
  - Add `resolutionStates: { pre: BattleState; post: BattleState } | null` state (initialised to `null`)
  - In the `onSubmit` handler passed to `PlanningScreen`, when `newState.phase === "end_of_turn"` or `"battle_ended"`, set `resolutionStates({ pre: state, post: newState })` instead of calling `setState(newState)` directly
  - Add a render branch before the existing phase switch: when `resolutionStates` is non-null, render `<ResolutionScreen preState={resolutionStates.pre} postState={resolutionStates.post} onComplete={() => { setState(resolutionStates.post); setResolutionStates(null) }} />`
  - Remove or guard the existing `resolving / end_of_turn / reversal_window` branch so it no longer fires when `resolutionStates` is active
  - _Requirements: 1.1, 1.2, 1.3_

- [x] 7. Final checkpoint — ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP
- Property tests use fast-check (already available via vitest in this project)
- `BirdCard` already has `transition-all` on its bars — no CSS changes needed for HP/Spirit animation
- `applySingleAction` must accept `originalPreState` (not `current`) for defender order lookup, matching `resolveTurn`'s closure over `p1Orders`/`p2Orders`
