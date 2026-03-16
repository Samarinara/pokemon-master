# Design Document: Turn Resolution Animation

## Overview

After both players submit orders, the battle currently jumps straight to the planning phase with only a static text log. This feature introduces a `ResolutionScreen` that plays out the turn visually — one `Action_Beat` at a time — before handing control back to `BattleClient`. All animation is driven purely from client-side state: the pre-resolution `BattleState` (captured just before `submitOrders` returns) and the post-resolution `BattleState` (returned by the server). No new server-side logic is required.

The core data pipeline is a pure function `buildSnapshots(preState)` that replays the `resolutionQueue` step by step, producing one `BattleState` per action. The `ResolutionScreen` component consumes this snapshot array, sequences beats with `useEffect` + `setTimeout`, and drives six `BirdCard` panels plus a central announcement area and a scrollable log.

## Architecture

```mermaid
flowchart TD
    PS[PlanningScreen] -->|onSubmit(postState)| BC[BattleClient]
    BC -->|preState + postState| RS[ResolutionScreen]
    RS -->|buildSnapshots(preState)| SN[Snapshot Array]
    SN --> BA[Beat Animator\nuseEffect + setTimeout]
    BA --> BirdCards[6 × BirdCard]
    BA --> Announce[Action Announcement]
    BA --> Log[Scrollable Log Panel]
    RS -->|onComplete| BC
    BC -->|phase=planning| PlanningScreen2[PlanningScreen]
    BC -->|phase=battle_ended| MS[MatchSummary]
```

### Key design decisions

- `buildSnapshots` is a pure function with no side effects — easy to unit-test and reason about.
- The `ResolutionScreen` owns all animation state internally; `BattleClient` only needs to store `preState` and `postState` and swap them out when `onComplete` fires.
- `BirdCard` already has `transition-all` on its bars, so animated HP/Spirit updates are free — we just pass updated `BirdInstance` values from the current snapshot.
- `prefers-reduced-motion` is handled by setting all beat durations to 0ms, so the sequencer logic is unchanged.

## Components and Interfaces

### `lib/snapshots.ts` — `buildSnapshots`

```ts
export function buildSnapshots(preState: BattleState): BattleState[]
```

- Takes the pre-resolution state (which must have a populated `resolutionQueue`).
- Iterates over `resolutionQueue`, applying each action to produce a new `BattleState` snapshot.
- Returns an array of length `resolutionQueue.length`, where `snapshots[i]` is the state **after** action `i` has been applied.
- Uses the same logic as `resolveTurn`'s inner loop, but extracted so each step is observable.
- Does **not** call `applyEndOfTurn` — that is the server's responsibility and is already reflected in `postState`.

Implementation sketch:

```ts
export function buildSnapshots(preState: BattleState): BattleState[] {
  const snapshots: BattleState[] = []
  let current = { ...preState, phase: "resolving" as const }

  for (let i = 0; i < preState.resolutionQueue.length; i++) {
    current = applySingleAction(current, preState.resolutionQueue[i], preState)
    snapshots.push(current)
  }
  return snapshots
}
```

`applySingleAction` mirrors the body of `resolveTurn`'s loop for a single index, using the original `preState` to look up defender orders (needed for block resolution).

### `components/battle/ResolutionScreen.tsx`

```ts
interface ResolutionScreenProps {
  preState: BattleState
  postState: BattleState
  onComplete: () => void
}
```

Internal state:

```ts
type BeatPhase = "announce" | "animating" | "result" | "pausing" | "reversal" | "done"

interface AnimState {
  beatIndex: number        // which action in resolutionQueue
  beatPhase: BeatPhase
  currentSnapshot: BattleState
  visibleLogEntries: LogEntry[]
}
```

The component:
1. Calls `buildSnapshots(preState)` once on mount (memoised with `useMemo`).
2. Runs a `useEffect` that advances `beatIndex` / `beatPhase` via `setTimeout`.
3. Renders `<BirdCard>` for all six slots driven by `currentSnapshot`.
4. Renders a central `<ActionAnnouncement>` driven by the current beat's action and outcome.
5. Renders a `<LogPanel>` that accumulates entries as beats complete.
6. Renders a `<SkipButton>` that calls `onComplete` immediately (after flushing remaining log entries to state).

### `components/battle/ActionAnnouncement.tsx`

A small presentational component:

```ts
interface ActionAnnouncementProps {
  action: ResolvedAction
  preSnapshot: BattleState   // snapshot before this beat
  postSnapshot: BattleState  // snapshot after this beat
  beatPhase: BeatPhase
}
```

Derives display text and indicators (miss / crit / switch names) by diffing `preSnapshot` and `postSnapshot`.

### `BattleClient.tsx` changes

Add two pieces of state:

```ts
const [resolutionStates, setResolutionStates] = useState<{
  pre: BattleState
  post: BattleState
} | null>(null)
```

In the `onSubmit` handler passed to `PlanningScreen`:

```ts
const handlePlanningSubmit = (newState: BattleState) => {
  if (newState.phase === "end_of_turn" || newState.phase === "battle_ended") {
    setResolutionStates({ pre: state, post: newState })
  } else {
    setState(newState)
  }
}
```

Add a render branch before the existing phase switch:

```tsx
if (resolutionStates) {
  return (
    <ResolutionScreen
      preState={resolutionStates.pre}
      postState={resolutionStates.post}
      onComplete={() => {
        setState(resolutionStates.post)
        setResolutionStates(null)
      }}
    />
  )
}
```

## Data Models

### Beat outcome (derived, not stored)

When `buildSnapshots` produces `snapshots[i]`, the outcome of beat `i` is derived by comparing `snapshots[i-1]` (or `preState` for `i=0`) with `snapshots[i]`:

| Outcome | Detection |
|---------|-----------|
| Hit | target HP decreased |
| Miss | target HP unchanged AND log entry contains "missed" |
| Crit | log entry contains "Critical hit!" |
| Faint | target `fainted` flipped to `true` |
| Switch | `order.type === "switch"` |
| Block | `order.type === "block"` |

### Beat timing table

| Beat phase | Duration | Condition |
|------------|----------|-----------|
| `announce` | 300ms | always |
| `animating` | 300ms | hit/crit; 0ms for miss/block/switch |
| `result` | 500ms | miss or switch; 0ms otherwise |
| `pausing` | 400ms | between beats |
| `reversal` | 1000ms | only when `reversalWindow` non-null after this beat |

With `prefers-reduced-motion`, all durations collapse to 0ms.

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: buildSnapshots round-trip

*For any* valid pre-resolution `BattleState` whose `resolutionQueue` is the same queue used to produce `postState`, the final element of `buildSnapshots(preState)` shall have `p1Field`, `p2Field`, and `battleLog` equal to those of `postState`.

**Validates: Requirements 6.3, 6.4**

### Property 2: Beat sequence matches resolution queue order

*For any* `ResolutionScreen` rendered with a given `preState`, the sequence of `Action_Beats` displayed shall be in the same order as `preState.resolutionQueue`.

**Validates: Requirements 2.1**

### Property 3: Beat announcement contains required fields

*For any* `ResolvedAction` in the resolution queue, the announcement rendered for that beat shall contain: the acting bird's name, the action type, and — when the action is an attack — the move name and the target bird's name.

**Validates: Requirements 2.2**

### Property 4: Log accumulation is monotone

*For any* animation sequence of N beats, after exactly K beats have completed (0 ≤ K ≤ N), the log panel shall contain exactly the `LogEntry` items produced by the first K beats, in order, with no entries from future beats.

**Validates: Requirements 4.1, 4.2**

## Error Handling

- If `resolutionQueue` is empty, `buildSnapshots` returns `[]` and `ResolutionScreen` calls `onComplete` immediately on mount.
- If a `ResolvedAction` references a bird that has already fainted (e.g. killed by an earlier beat), `applySingleAction` skips it — matching the engine's own skip logic — so the snapshot sequence remains consistent.
- If `buildSnapshots` produces a final snapshot that does not match `postState` (detectable in development via an assertion), the component falls back to using `postState` directly and logs a warning. This prevents a broken animation from blocking the game.
- Network errors during `submitOrders` are already handled by `PlanningScreen`; `ResolutionScreen` is only mounted after a successful response.

## Testing Strategy

### Unit tests

- `buildSnapshots` with a hand-crafted `preState` containing a known queue: verify each intermediate snapshot's HP values match expected values.
- `buildSnapshots` with an empty queue: verify it returns `[]`.
- `buildSnapshots` with a queue where the first action faints a bird: verify the second action is skipped in the snapshot.
- `ActionAnnouncement` rendering: verify miss/crit/switch/block text for specific example inputs.
- `ResolutionScreen` skip: verify `onComplete` is called when skip is activated.
- `ResolutionScreen` log: verify log starts empty and contains all entries after skip.
- `ResolutionScreen` reversal window: verify indicator is shown when `reversalWindow` is non-null.
- `BattleClient` routing: verify `ResolutionScreen` is rendered when `onSubmit` returns a state with `phase === "end_of_turn"`.

### Property-based tests

Uses [fast-check](https://github.com/dubzzz/fast-check) (already available in the project via vitest).

Each property test runs a minimum of 100 iterations.

**Property 1 test** — `buildSnapshots` round-trip:
```
// Feature: turn-resolution-animation, Property 1: buildSnapshots round-trip
fc.assert(fc.property(arbPrePostStatePair(), ({ preState, postState }) => {
  const snapshots = buildSnapshots(preState)
  const final = snapshots[snapshots.length - 1]
  expect(final.p1Field).toEqual(postState.p1Field)
  expect(final.p2Field).toEqual(postState.p2Field)
  expect(final.battleLog).toEqual(postState.battleLog)
}), { numRuns: 100 })
```

`arbPrePostStatePair()` generates a random `BattleState` and runs `resolveTurn` with a seeded RNG to produce the matching `postState`, ensuring the pair is always consistent.

**Property 2 test** — beat order:
```
// Feature: turn-resolution-animation, Property 2: beat sequence matches resolution queue order
fc.assert(fc.property(arbPreState(), (preState) => {
  const snapshots = buildSnapshots(preState)
  expect(snapshots.length).toBe(preState.resolutionQueue.length)
  // Each snapshot corresponds to the action at the same index
}), { numRuns: 100 })
```

**Property 3 test** — announcement fields:
```
// Feature: turn-resolution-animation, Property 3: beat announcement contains required fields
fc.assert(fc.property(arbResolvedAction(), arbBattleState(), (action, state) => {
  const text = formatAnnouncement(action, state)
  expect(text).toContain(getActingBird(action, state).bird.name)
  if (action.order.type === "attack") {
    expect(text).toContain(action.order.moveId) // or move name
  }
}), { numRuns: 100 })
```

**Property 4 test** — log accumulation:
```
// Feature: turn-resolution-animation, Property 4: log accumulation is monotone
fc.assert(fc.property(arbPreState(), (preState) => {
  const snapshots = buildSnapshots(preState)
  for (let k = 0; k < snapshots.length; k++) {
    // log at snapshot k should be a prefix of the final log
    const kLog = snapshots[k].battleLog.filter(e => e.turn === preState.turn)
    const finalLog = snapshots[snapshots.length - 1].battleLog.filter(e => e.turn === preState.turn)
    expect(finalLog.slice(0, kLog.length)).toEqual(kLog)
  }
}), { numRuns: 100 })
```
