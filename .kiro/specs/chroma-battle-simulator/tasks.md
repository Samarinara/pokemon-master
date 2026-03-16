# Implementation Plan: Chroma Battle Simulator

## Overview

Implement the CHROMA battle simulator as a Next.js app with TypeScript, Tailwind, and shadcn/ui. The Battle Engine is a pure server-side function; the client is a pure view layer. All randomness and turn resolution happen in Server Actions. SQLite via sql.js persists state.

## Tasks

- [x] 1. Define shared TypeScript types (`lib/types.ts`)
  - Create `lib/types.ts` with all interfaces and enums from the design: `Colour`, `Height`, `PowerTier`, `StatusCondition`, `Player`, `Slot`, `Move`, `Stats`, `Bird`, `BirdInstance`, `Roster`, `PlayerField`, `Order` (AttackOrder / BlockOrder / SwitchOrder), `OrderSet`, `ResolvedAction`, `BattleState`, `BattlePhase`, `ReversalWindowState`, `LogEntry`, `MatchState`, `PlacementOrder`, `Result`, `ValidationError`, `RNG`, `WinResult`
  - _Requirements: 1.1–1.7, 2.1–2.7, 3.1–3.4, 4.1–4.6, 5.1–5.9, 6.1–6.8, 7.1–7.6, 8.1–8.7, 9.1–9.6, 10.1–10.5, 11.1–11.7, 12.1–12.5, 15.1–15.5, 16.1–16.5_

- [x] 2. Implement server-side RNG (`lib/rng.ts`)
  - Implement the `RNG` interface: `next()` returns a float in [0, 1), `nextInt(max)` returns an integer in [0, max)
  - Export a `createRng()` factory that uses `Math.random` internally (server-only)
  - _Requirements: 5.9, 15.4_

- [x] 3. Implement Move Parser / Pretty-Printer (`lib/moves.ts`)
  - Implement `parseMove(raw: unknown): Result<Move, ValidationError>` — validates all required fields and returns a descriptive error identifying the offending field on failure
  - Implement `printMove(move: Move): MoveDefinition` — serialises a `Move` back to a plain object
  - Implement `parseRoster(raw: unknown): Result<Roster, ValidationError>`
  - _Requirements: 16.1, 16.2, 16.3, 16.4, 16.5_

  - [x] 3.1 Write property test for Move round-trip (Property 20)
    - **Property 20: Move Round-Trip**
    - **Validates: Requirements 16.1, 16.2, 16.3, 16.4, 16.5**
    - File: `lib/moves.test.ts`

- [x] 4. Implement Team Generator (`lib/teamgen.ts`)
  - Implement `generateMove(rng, colour)` — produces a valid `Move` with all required fields
  - Implement `generateBird(rng, existingNames)` — produces a `Bird` with colour in the 8-colour set, HP in [120, 220], STR/GUTS/SPD/SPIRIT in [60, 140], exactly 4 moves; retries on name collision (max 10 attempts)
  - Implement `generateRoster(rng)` — produces a `Roster` of exactly 3 distinct birds
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6_

  - [x] 4.1 Write property test for Roster Structure Invariant (Property 1)
    - **Property 1: Roster Structure Invariant**
    - **Validates: Requirements 1.1, 1.2, 1.5, 1.7**
    - File: `lib/teamgen.test.ts`

  - [x] 4.2 Write property test for Generated Bird Stat Invariants (Property 2)
    - **Property 2: Generated Bird Stat Invariants**
    - **Validates: Requirements 1.3, 1.4**
    - File: `lib/teamgen.test.ts`

- [x] 5. Implement Battle Engine core — Resolution Queue and damage helpers (`lib/engine.ts`)
  - Implement `buildResolutionQueue(state, p1Orders, p2Orders, rng)` — collects 4 actions, computes priority/spd/tieBreaker per action, sorts by `[−priority, −spd, tieBreaker]`
  - Implement `computeTrueAcc(moveAcc, spirit)` — `clamp(moveAcc × (1 + (spirit − 60) / 400), 10, 100)`
  - Implement `getTypeMultiplier(attackColour, defenderColour)` — primary cycle, secondary cycle, Pink/Black rules
  - Implement `getStabMultiplier(bird, move)` — 1.5× primary, 1.2× secondary, 1× otherwise
  - Implement `computeDamage(powerTier, str, guts, typeMultiplier, stabMultiplier, critMultiplier, blockMultiplier)`
  - Implement `applyStatStage(instance, stat, stages)` — clamps result to [−6, +6]
  - _Requirements: 5.2, 5.3, 6.5, 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 12.4_

  - [x] 5.1 Write property test for Resolution Queue Ordering (Property 3)
    - **Property 3: Resolution Queue Ordering**
    - **Validates: Requirements 5.2, 5.3**
    - File: `lib/engine.test.ts`

  - [x] 5.2 Write property test for True Accuracy Formula (Property 6)
    - **Property 6: True Accuracy Formula**
    - **Validates: Requirements 6.5, 12.4**
    - File: `lib/engine.test.ts`

  - [x] 5.3 Write property test for Damage Formula Correctness (Property 9)
    - **Property 9: Damage Formula Correctness**
    - **Validates: Requirements 8.1**
    - File: `lib/engine.test.ts`

  - [x] 5.4 Write property test for STAB Multiplier (Property 10)
    - **Property 10: STAB Multiplier**
    - **Validates: Requirements 8.2, 8.3**
    - File: `lib/engine.test.ts`

  - [x] 5.5 Write property test for Type Effectiveness (Property 11)
    - **Property 11: Type Effectiveness**
    - **Validates: Requirements 8.4, 8.5, 8.6**
    - File: `lib/engine.test.ts`

  - [x] 5.6 Write property test for Stat Stage Clamping (Property 12)
    - **Property 12: Stat Stage Clamping**
    - **Validates: Requirements 6.8, 8.7**
    - File: `lib/engine.test.ts`

- [x] 6. Implement Battle Engine — Attack vs Block resolution and crit logic
  - Implement `resolveAttackVsBlock(attack, block, attackerBird, defenderInstance, rng)` — returns `{ damageMultiplier, grantReversal, isCrit }` per the rules in Requirements 7.1–7.6
  - Implement crit protection: if crit would reduce HP to 0 and pre-hit HP > 50% maxHp, set HP to 1
  - Implement Power Tier reduction for Reversal moves and Switch-Attack moves (Strong → Normal → Weak; Weak stays Weak)
  - _Requirements: 6.3, 6.4, 7.1, 7.2, 7.3, 7.4, 7.5, 7.6_

  - [x] 6.1 Write property test for Attack vs Block Resolution (Property 7)
    - **Property 7: Attack vs Block Resolution**
    - **Validates: Requirements 7.1, 7.2, 7.3, 7.6**
    - File: `lib/engine.test.ts`

  - [x] 6.2 Write property test for Crit Protection Edge Case (Property 8)
    - **Property 8: Crit Protection Edge Case**
    - **Validates: Requirements 7.4**
    - File: `lib/engine.test.ts`

  - [x] 6.3 Write property test for Power Tier Reduction (Property 5)
    - **Property 5: Power Tier Reduction**
    - **Validates: Requirements 6.3, 6.4**
    - File: `lib/engine.test.ts`

- [x] 7. Implement Battle Engine — `resolveTurn`, switching, and Reversal Window
  - Implement `resolveTurn(state, p1Orders, p2Orders, rng)` — executes the Resolution Queue one action at a time; skips actions for fainted birds; pauses queue on Reversal Window; applies Switch rules (outgoing to bench, incoming to active, stat stages reset)
  - Implement switch resolution: move outgoing bird to bench, reset its stat stages to 0, place incoming bird in active slot
  - Implement Reversal Window state: set `reversalWindow` on state, mark incoming bird's `skipNextAction = true` on tag-in
  - _Requirements: 5.4, 5.5, 5.6, 9.1, 9.3, 9.4, 9.5, 9.6, 10.1, 10.2, 10.3, 10.4, 10.5_

  - [x] 7.1 Write property test for Turn Resolution Returns Valid State (Property 4)
    - **Property 4: Turn Resolution Returns Valid State**
    - **Validates: Requirements 2.4, 5.4**
    - File: `lib/engine.test.ts`

  - [x] 7.2 Write property test for Switch Field Position Update (Property 13)
    - **Property 13: Switch Field Position Update**
    - **Validates: Requirements 9.4, 10.2, 10.3**
    - File: `lib/engine.test.ts`

  - [x] 7.3 Write property test for Reversal Incoming Bird Loses Next Action (Property 14)
    - **Property 14: Reversal Incoming Bird Loses Next Action**
    - **Validates: Requirements 9.5, 10.5**
    - File: `lib/engine.test.ts`

- [x] 8. Implement Battle Engine — `applyEndOfTurn` and `checkWinCondition`
  - Implement `applyEndOfTurn(state, rng)` — applies Bleed (HP −1/8 maxHp, STR −1, SPIRIT −1), Shaken (SPD −1), Bruised (recoil 15% of damage dealt, capped at 25% maxHp), then Spirit recovery (+5, capped at baseStats.spirit)
  - Implement `checkWinCondition(state)` — returns winner if both active birds of a player have `fainted = true`
  - Initialise each bird's `currentSpirit` to `bird.baseStats.spirit` at battle start
  - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 11.7, 12.1, 12.2, 12.3_

  - [~] 8.1 Write property test for End-of-Turn Status Effects (Property 15)
    - **Property 15: End-of-Turn Status Effects**
    - **Validates: Requirements 11.2, 11.3, 11.4**
    - File: `lib/engine.test.ts`

  - [~] 8.2 Write property test for Spirit Recovery (Property 16)
    - **Property 16: Spirit Recovery**
    - **Validates: Requirements 11.5, 12.3**
    - File: `lib/engine.test.ts`

  - [~] 8.3 Write property test for Win Condition Detection (Property 17)
    - **Property 17: Win Condition Detection**
    - **Validates: Requirements 11.6**
    - File: `lib/engine.test.ts`

  - [~] 8.4 Write property test for Spirit Initialisation (Property 21)
    - **Property 21: Spirit Initialisation**
    - **Validates: Requirements 12.1**
    - File: `lib/engine.test.ts`

- [x] 9. Checkpoint — Ensure all engine and parser tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. Implement State Store (`lib/store.ts`)
  - Replace the existing `lib/battle.ts` DB logic with `lib/store.ts`
  - Initialise the three-table schema (`matches`, `battles`, `pending_orders`) on first use; migrate existing `battles` table if present
  - Implement `saveBattle(state)`, `loadBattle(id)`, `deleteBattle(id)`, `savePendingOrders(id, player, orders)`, `loadPendingOrders(id)`
  - Export a `saveDb()` helper that flushes the in-memory sql.js database to `data/battles.db`
  - _Requirements: 5.8, 15.3_

  - [x] 10.1 Write unit tests for State Store
    - Test save/load round-trip for `BattleState`
    - Test `savePendingOrders` / `loadPendingOrders` for both players
    - Test `deleteBattle` removes the battle and its pending orders
    - File: `lib/store.test.ts`

- [x] 11. Implement Server Actions (`lib/actions.ts`)
  - Mark file `"use server"`
  - Implement `startBattle()` — creates a match, generates two rosters via `generateRoster`, initialises `BattleState` in `placement_p1` phase, persists via `saveBattle`, returns state
  - Implement `confirmPlacement(battleId, player, placement)` — validates exactly 2 active + 1 bench, advances phase; returns `{ error: "INVALID_PLACEMENT" }` on bad count; initialises `currentSpirit` for each bird
  - Implement `submitOrders(battleId, player, orders)` — validates order legality, saves pending orders; when both players have submitted calls `resolveTurn` then `applyEndOfTurn`, persists new state, deletes pending rows, returns updated state
  - Implement `getState(battleId)` — loads and returns `BattleState | null`
  - Implement `deleteBattle(battleId)` — removes battle from store
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.6, 2.7, 3.1, 3.2, 3.3, 3.4, 4.3, 4.4, 4.5, 4.6, 5.1, 5.7, 5.8, 15.1, 15.2, 15.5_

  - [x] 11.1 Write property test for Placement Validation (Property 19)
    - **Property 19: Placement Validation**
    - **Validates: Requirements 3.2, 3.3**
    - File: `lib/engine.test.ts`

  - [x] 11.2 Write property test for Match Score Tracking (Property 18)
    - **Property 18: Match Score Tracking**
    - **Validates: Requirements 2.6, 2.7**
    - File: `lib/engine.test.ts`

- [x] 12. Create fast-check arbitraries (`lib/test-utils/arbitraries.ts`)
  - Implement `arbitraryColour()`, `arbitraryMove()`, `arbitraryBird()`, `arbitraryRoster()`, `arbitraryBirdInstance()`, `arbitraryOrderSet()`, `arbitraryBattleState()` (in `planning` phase)
  - These are shared across all property test files
  - _Requirements: (test infrastructure)_

- [x] 13. Implement UI components
  - [x] 13.1 Create `components/battle/BirdCard.tsx`
    - Display bird name, colour badge, HP bar (currentHp / baseStats.hp), Spirit meter, status condition icon, stat stage indicators
    - _Requirements: 12.5, 13.3_

  - [x] 13.2 Create `components/battle/BattleLog.tsx`
    - Scrollable list of `LogEntry` items; auto-scrolls to bottom on new entries
    - _Requirements: 2.5_

  - [x] 13.3 Create `components/battle/PlacementScreen.tsx`
    - Show 3 bird cards; allow player to drag/click to assign Left, Right, Bench slots; validate exactly 2 active + 1 bench before enabling confirm; call `confirmPlacement` Server Action on submit; show validation error if count is wrong
    - _Requirements: 3.1, 3.2, 3.3_

  - [x] 13.4 Create `components/battle/PlanningScreen.tsx`
    - 4-action grid: Left Active column and Right Active column, each with Attack (pick move + target), Block High, Block Low, Switch options; display damage preview (STAB, type, crit multipliers); Spirit meter and live accuracy %; 15-second countdown timer; lock-in button calls `submitOrders`; conceal orders after lock-in
    - _Requirements: 4.1, 4.2, 4.5, 13.1, 13.2, 13.3, 13.4, 13.5_

  - [x] 13.5 Create `components/battle/TimelineBar.tsx`
    - Display resolved actions left-to-right sorted by SPD; colour-coded height icon per action; highlight currently executing action; render `ReversalPrompt` inline when `reversalWindow` is set
    - _Requirements: 14.1, 14.2, 14.4_

  - [x] 13.6 Create `components/battle/ReversalPrompt.tsx`
    - Overlay prompt with 3-second countdown; accept/decline buttons; on accept show bench bird's reversal-legal moves; calls `submitOrders` with reversal action; auto-declines on timeout
    - _Requirements: 9.1, 9.2, 9.3, 14.3_

  - [x] 13.7 Create `components/battle/MatchSummary.tsx`
    - Display p1Wins / p2Wins score; show match winner when `complete = true`; "Play again" button that calls `startBattle`
    - _Requirements: 2.6, 2.7_

- [x] 14. Implement `app/battle/[id]/page.tsx` (BattlePage)
  - Server Component that calls `getState(id)` and renders the correct sub-component based on `BattleState.phase`: `PlacementScreen` for placement phases, `PlanningScreen` for planning/awaiting phases, `TimelineBar` + `BattleLog` for resolving, `MatchSummary` for `battle_ended`
  - Pass `BirdCard` instances for each active bird
  - _Requirements: 2.1, 2.2, 2.3, 2.5, 3.1_

- [x] 15. Update `app/page.tsx` (home page)
  - Add a "Start Battle" button that calls the `startBattle` Server Action and redirects to `/battle/[id]`
  - _Requirements: 1.1, 2.1_

- [x] 16. Wire everything together and remove legacy code
  - Delete or replace `lib/battle.ts` — all functionality is now in `lib/engine.ts`, `lib/store.ts`, and `lib/actions.ts`
  - Add `vitest` and `fast-check` to `devDependencies` in `package.json` and create `vitest.config.ts` if not present
  - Ensure all imports across `app/` and `components/` reference the new modules
  - _Requirements: 15.1, 15.2, 15.5_

- [x] 17. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP
- Each task references specific requirements for traceability
- Properties 1–21 each map to exactly one property-based test sub-task
- Checkpoints at tasks 9 and 17 ensure incremental validation
- `lib/test-utils/arbitraries.ts` (task 12) should be created before running property tests; it is shared across all test files
- `lib/battle.ts` is superseded by the new modules and should be removed in task 16
