# Design Document: Chroma Battle Simulator

## Overview

Chroma Battle Simulator is a simultaneous-move, 2-v-2 turn-based battle game built on a colour-theory type chart. Two players share one device (pass-n-play), each secretly assigning orders to their two active Birds during a planning phase. Orders are locked simultaneously, then resolved server-side in priority and speed order.

The architecture is designed so that the Battle Engine is a pure function — it takes a `BattleState` plus two sets of locked orders and returns a new `BattleState`. All randomness lives on the server. The only thing that changes for netplay is the input-collection layer; the resolution logic is untouched.

### Key Design Decisions

- **Server-side purity**: All game logic, RNG, and state transitions happen in Next.js Server Actions. The client is a pure view layer.
- **Pass-n-play first, netplay ready**: Sequential order submission on one device today; swapping the input layer for WebSockets tomorrow requires no changes to the engine.
- **SQLite via sql.js**: Existing `data/battles.db` is used for persistence. The schema is extended to support the full CHROMA state model.
- **Bird theme**: All combatants are birds. The existing codebase uses Pokémon Showdown as a simulation backend; this design replaces that with a custom engine.

---

## Architecture

### Server / Client Split

```
┌─────────────────────────────────────────────────────────────┐
│  CLIENT (Browser)                                           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │ PlanningUI   │  │ TimelineBar  │  │ BattleLogView    │  │
│  └──────┬───────┘  └──────┬───────┘  └────────┬─────────┘  │
│         │                 │                    │            │
│         └─────────────────┴────────────────────┘            │
│                           │ Server Actions (RPC)            │
└───────────────────────────┼─────────────────────────────────┘
                            │
┌───────────────────────────┼─────────────────────────────────┐
│  SERVER (Next.js)         │                                 │
│  ┌────────────────────────▼──────────────────────────────┐  │
│  │  Server Actions (lib/actions.ts)                      │  │
│  │  startBattle · submitOrders · getState · deleteBattle │  │
│  └──────────┬────────────────────────┬────────────────── ┘  │
│             │                        │                      │
│  ┌──────────▼──────────┐  ┌──────────▼──────────────────┐   │
│  │  Battle Engine      │  │  Team Generator             │   │
│  │  lib/engine.ts      │  │  lib/teamgen.ts             │   │
│  │  (pure function)    │  │  (server-only RNG)          │   │
│  └──────────┬──────────┘  └─────────────────────────────┘   │
│             │                                               │
│  ┌──────────▼──────────┐                                    │
│  │  State Store        │                                    │
│  │  lib/store.ts       │                                    │
│  │  (SQLite/sql.js)    │                                    │
│  └─────────────────────┘                                    │
└─────────────────────────────────────────────────────────────┘
```

### Data Flow

1. Client calls `startBattle()` Server Action → Team Generator creates two rosters → Battle Engine initialises `BattleState` → State Store persists it → Client receives state snapshot.
2. Player 1 submits orders via `submitOrders(battleId, "p1", orders)` → stored as pending, not yet resolved.
3. Player 2 submits orders via `submitOrders(battleId, "p2", orders)` → both order sets now present → Battle Engine resolves turn → State Store persists new state → Client receives updated snapshot.
4. Client renders the new state (timeline, log, HP bars). Repeat from step 2.

### Netplay Readiness

The pass-n-play input layer (`submitOrders` called sequentially from one browser) is the only coupling to the single-device model. For netplay:

- Replace `submitOrders` with a WebSocket message handler that buffers orders from two separate connections.
- When both connections have submitted, call `resolveTurn(state, p1Orders, p2Orders)` — the same pure function used today.
- No changes to `lib/engine.ts`, `lib/teamgen.ts`, or `lib/store.ts`.

---

## Components and Interfaces

### Battle Engine (`lib/engine.ts`)

The core pure function. Accepts a `BattleState` and two `OrderSet` values, returns a new `BattleState`.

```typescript
// Pure function — no I/O, no RNG injection from outside
export function resolveTurn(
  state: BattleState,
  p1Orders: OrderSet,
  p2Orders: OrderSet,
  rng: RNG  // server-supplied, never client-supplied
): BattleState

export function applyEndOfTurn(state: BattleState, rng: RNG): BattleState
export function buildResolutionQueue(state: BattleState, p1Orders: OrderSet, p2Orders: OrderSet, rng: RNG): ResolvedAction[]
export function checkWinCondition(state: BattleState): WinResult | null
```

### Team Generator (`lib/teamgen.ts`)

Server-only. Generates a valid `Roster` using server-side RNG.

```typescript
export function generateRoster(rng: RNG): Roster
export function generateBird(rng: RNG, existingNames: Set<string>): Bird
export function generateMove(rng: RNG, colour: Colour): Move
```

### Move Parser / Pretty-Printer (`lib/moves.ts`)

Parses and serialises move definitions. Used for the move database and testing.

```typescript
export function parseMove(raw: unknown): Result<Move, ValidationError>
export function printMove(move: Move): MoveDefinition
export function parseRoster(raw: unknown): Result<Roster, ValidationError>
```

### State Store (`lib/store.ts`)

Wraps sql.js. All reads/writes go through this module.

```typescript
export async function saveBattle(state: BattleState): Promise<void>
export async function loadBattle(id: string): Promise<BattleState | null>
export async function deleteBattle(id: string): Promise<void>
export async function savePendingOrders(id: string, player: Player, orders: OrderSet): Promise<void>
export async function loadPendingOrders(id: string): Promise<{ p1?: OrderSet; p2?: OrderSet }>
```

### Server Actions (`lib/actions.ts`)

The RPC boundary. All functions are marked `"use server"`.

```typescript
export async function startBattle(): Promise<BattleState>
export async function submitOrders(battleId: string, player: Player, orders: OrderSet): Promise<BattleState>
export async function getState(battleId: string): Promise<BattleState | null>
export async function confirmPlacement(battleId: string, player: Player, placement: PlacementOrder): Promise<BattleState>
export async function deleteBattle(battleId: string): Promise<void>
```

### UI Components

| Component | Location | Responsibility |
|-----------|----------|----------------|
| `BattlePage` | `app/battle/[id]/page.tsx` | Top-level page, fetches state |
| `PlanningScreen` | `components/battle/PlanningScreen.tsx` | 4-action grid, timer, order submission |
| `TimelineBar` | `components/battle/TimelineBar.tsx` | Post-lock action order display |
| `BirdCard` | `components/battle/BirdCard.tsx` | HP bar, Spirit meter, status icons |
| `BattleLog` | `components/battle/BattleLog.tsx` | Scrollable turn log |
| `PlacementScreen` | `components/battle/PlacementScreen.tsx` | Turn-0 roster placement |
| `ReversalPrompt` | `components/battle/ReversalPrompt.tsx` | 3-second reversal window overlay |
| `MatchSummary` | `components/battle/MatchSummary.tsx` | Best-of-3 score and winner |

---

## Data Models

```typescript
// ── Enums ──────────────────────────────────────────────────────────────────

type Colour = "Red" | "Yellow" | "Blue" | "Orange" | "Purple" | "Green" | "Pink" | "Black"
type Height = "High" | "Mid" | "Low"
type PowerTier = "Weak" | "Normal" | "Strong"  // base: 40 / 70 / 100
type StatusCondition = "Bleed" | "Shaken" | "Bruised"
type Player = "p1" | "p2"
type Slot = "left" | "right" | "bench"

// ── Move ───────────────────────────────────────────────────────────────────

interface Move {
  id: string
  name: string
  colour: Colour
  height: Height
  powerTier: PowerTier
  accuracy: number          // 10–100
  priority: number          // integer, default 0
  statStage?: {
    target: "self" | "opponent"
    stat: keyof Stats
    stages: 1 | 2 | -1 | -2
  }
  status?: {
    condition: StatusCondition
    procChance: number       // 0–100
  }
  flags: {
    reversalLegal: boolean
    switchAttackLegal: boolean
    contact: boolean
    special: boolean
  }
}

// ── Bird ───────────────────────────────────────────────────────────────────

interface Stats {
  hp: number       // 120–220
  str: number      // 60–140
  guts: number     // 60–140
  spd: number      // 60–140
  spirit: number   // 60–140
}

interface Bird {
  id: string
  name: string
  colour: Colour
  baseStats: Stats
  moves: Move[]    // exactly 4
}

// ── In-battle Bird instance ────────────────────────────────────────────────

interface BirdInstance {
  bird: Bird
  currentHp: number
  currentSpirit: number
  statStages: Record<keyof Omit<Stats, "hp">, number>  // –6 to +6
  status: StatusCondition | null
  skipNextAction: boolean   // set after reversal tag-in
  fainted: boolean
}

// ── Roster & Field ─────────────────────────────────────────────────────────

interface Roster {
  birds: [Bird, Bird, Bird]  // exactly 3, no duplicates
}

interface PlayerField {
  left: BirdInstance
  right: BirdInstance
  bench: BirdInstance
}

// ── Orders ─────────────────────────────────────────────────────────────────

type AttackOrder = { type: "attack"; slot: Slot; moveId: string; targetSlot: Slot }
type BlockOrder  = { type: "block";  slot: Slot; height: "High" | "Low" }
type SwitchOrder = { type: "switch"; slot: Slot; switchAttackMoveId?: string }

type Order = AttackOrder | BlockOrder | SwitchOrder

interface OrderSet {
  left: Order
  right: Order
}

// ── Resolution Queue ───────────────────────────────────────────────────────

interface ResolvedAction {
  player: Player
  slot: Slot
  order: Order
  priority: number   // from move.priority, or 0 for block/switch
  spd: number        // acting bird's current effective SPD
  tieBreaker: number // server RNG value, used only when priority + spd both tie
}

// ── Battle State ───────────────────────────────────────────────────────────

type BattlePhase =
  | "placement_p1"
  | "placement_p2"
  | "planning"
  | "awaiting_p2_orders"
  | "resolving"
  | "reversal_window"
  | "end_of_turn"
  | "battle_ended"

interface BattleState {
  id: string
  matchId: string
  phase: BattlePhase
  turn: number
  p1Field: PlayerField
  p2Field: PlayerField
  pendingOrders: {
    p1?: OrderSet
    p2?: OrderSet
  }
  resolutionQueue: ResolvedAction[]
  currentQueueIndex: number
  reversalWindow: ReversalWindowState | null
  battleLog: LogEntry[]
  winner: Player | null
  createdAt: number
}

interface ReversalWindowState {
  defendingPlayer: Player
  defendingSlot: Slot
  timeoutMs: number
}

interface LogEntry {
  turn: number
  text: string
}

// ── Match State ────────────────────────────────────────────────────────────

interface MatchState {
  id: string
  p1Wins: number
  p2Wins: number
  battles: string[]   // battle IDs in order
  winner: Player | null
  complete: boolean
}

// ── Placement ──────────────────────────────────────────────────────────────

interface PlacementOrder {
  leftBirdId: string
  rightBirdId: string
  benchBirdId: string
}

// ── Result type (for Move Parser) ──────────────────────────────────────────

type Result<T, E> = { ok: true; value: T } | { ok: false; error: E }

interface ValidationError {
  field: string
  message: string
}

// ── RNG ────────────────────────────────────────────────────────────────────

interface RNG {
  next(): number          // returns [0, 1)
  nextInt(max: number): number
}
```

---

## Resolution Queue Algorithm

The Resolution Queue determines the order in which all actions execute within a turn.

### Building the Queue

1. Collect all 4 orders (p1 left, p1 right, p2 left, p2 right).
2. For each order, compute:
   - `priority`: the move's `priority` field for Attack orders; `0` for Block and Switch orders.
   - `spd`: the acting bird's current effective SPD (base SPD × stage multiplier).
   - `tieBreaker`: a server-generated random float in [0, 1).
3. Sort ascending by `[−priority, −spd, tieBreaker]` (i.e. highest priority first, then highest SPD, then random for ties).

### Sorting Rules

```
sort key = (−priority, −spd, tieBreaker)
```

- Two actions with different `priority` values: higher priority goes first.
- Two actions with the same `priority` but different `spd`: higher SPD goes first.
- Two actions with the same `priority` AND same `spd`: server RNG `tieBreaker` determines order.

### Execution

Actions execute one at a time. Each action sees the state as modified by all preceding actions in the same queue. If a bird faints mid-queue, any remaining actions targeting that bird are skipped. If the acting bird faints before its action, that action is also skipped.

### Reversal Window Interruption

When an Attack action grants a Reversal Window, the queue pauses. The defending player has 3 seconds to respond. After the reversal resolves (or times out), the queue resumes from the next index.

---

## SQLite Schema

The existing `battles` table is replaced with a richer schema:

```sql
CREATE TABLE IF NOT EXISTS matches (
  id          TEXT PRIMARY KEY,
  p1_wins     INTEGER NOT NULL DEFAULT 0,
  p2_wins     INTEGER NOT NULL DEFAULT 0,
  winner      TEXT,
  complete    INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER DEFAULT (strftime('%s', 'now'))
);

CREATE TABLE IF NOT EXISTS battles (
  id          TEXT PRIMARY KEY,
  match_id    TEXT NOT NULL REFERENCES matches(id),
  state       TEXT NOT NULL,   -- JSON-serialised BattleState
  created_at  INTEGER DEFAULT (strftime('%s', 'now'))
);

CREATE TABLE IF NOT EXISTS pending_orders (
  battle_id   TEXT NOT NULL REFERENCES battles(id),
  player      TEXT NOT NULL CHECK(player IN ('p1','p2')),
  orders      TEXT NOT NULL,   -- JSON-serialised OrderSet
  submitted_at INTEGER DEFAULT (strftime('%s', 'now')),
  PRIMARY KEY (battle_id, player)
);
```

`BattleState` is stored as a single JSON blob in `battles.state`. The `pending_orders` table holds orders that have been submitted but not yet resolved (i.e. only one player has submitted so far). Once both players submit and the turn resolves, the pending rows are deleted and the new `BattleState` is written.

---

## Error Handling

| Scenario | Handling |
|----------|----------|
| Invalid order submitted (move not in moveset) | Server Action returns `{ error: "INVALID_ORDER" }` |
| Order submitted for wrong phase | Server Action returns `{ error: "WRONG_PHASE" }` |
| Battle not found | Server Action returns `null` / throws `NotFoundError` |
| Placement with wrong bird count | Server Action returns `{ error: "INVALID_PLACEMENT" }` |
| Move accuracy check fails | Engine records miss in log, deals 0 damage, continues queue |
| Reversal window timeout | Engine defaults to "decline", resumes queue |
| Timer expiry (planning phase) | Server auto-assigns `Block Low` to unsubmitted birds |
| DB write failure | Server Action throws; client shows generic error toast |
| Duplicate bird in roster | Team Generator retries generation (max 10 attempts) |

---


## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

---

### Property 1: Roster Structure Invariant

*For any* call to `generateRoster`, the returned roster must contain exactly 3 birds, all bird identities must be distinct, each bird must have exactly 4 moves, and after placement exactly 2 birds occupy Active slots and 1 occupies the Bench slot.

**Validates: Requirements 1.1, 1.2, 1.5, 1.7**

---

### Property 2: Generated Bird Stat Invariants

*For any* bird produced by `generateBird`, its colour must be one of the 8 valid colours, HP must be in [120, 220], and STR, GUTS, SPD, SPIRIT must each be in [60, 140].

**Validates: Requirements 1.3, 1.4**

---

### Property 3: Resolution Queue Ordering

*For any* set of 4 actions with associated priority, SPD, and tie-breaker values, `buildResolutionQueue` must return them sorted such that: higher priority always precedes lower priority; within the same priority, higher SPD always precedes lower SPD; within the same priority and SPD, the tie-breaker determines order and no two actions share the same queue position.

**Validates: Requirements 5.2, 5.3**

---

### Property 4: Turn Resolution Returns Valid State

*For any* `BattleState` in the `planning` phase and any two valid `OrderSet` values, calling `resolveTurn` must return a `BattleState` where: all HP values are ≥ 0, all Spirit values are ≥ 0, all stat stages are in [−6, +6], and the phase has advanced beyond `planning`.

**Validates: Requirements 2.4, 5.4**

---

### Property 5: Power Tier Reduction

*For any* move with a given `PowerTier`, when used as a Reversal move or as a Switch-Attack, the effective base power must be one step lower (Strong → Normal → Weak; Weak stays Weak).

**Validates: Requirements 6.3, 6.4**

---

### Property 6: True Accuracy Formula

*For any* move accuracy value in [10, 100] and any Spirit value in [0, 140], `computeTrueAcc(moveAcc, spirit)` must equal `clamp(moveAcc × (1 + (spirit − 60) / 400), 10, 100)`.

**Validates: Requirements 6.5, 12.4**

---

### Property 7: Attack vs Block Resolution

*For any* attack and block pair:
- Mid attack vs any block → damage multiplier is 1×, no Reversal Window granted.
- High/Low attack vs correct matching block → damage multiplier is 0.5×, Reversal Window granted.
- High/Low attack vs wrong block (crit) → damage multiplier is 1.5×, defender Spirit reduced by 10, no Reversal Window granted.
- Attack vs non-blocking bird → damage multiplier is 1×, no block or crit logic applied.

**Validates: Requirements 7.1, 7.2, 7.3, 7.6**

---

### Property 8: Crit Protection Edge Case

*For any* crit hit where the target's HP before the hit was above 50% of its maximum HP, if the computed damage would reduce HP to 0 or below, the target's HP must be set to 1 instead.

**Validates: Requirements 7.4**

---

### Property 9: Damage Formula Correctness

*For any* combination of `PowerTier`, attacker STR, defender GUTS, type multiplier, STAB multiplier, crit multiplier, and block multiplier, `computeDamage(...)` must equal `floor(PowerTier × (STR / 100) × (100 / (100 + GUTS)) × typeMultiplier × stabMultiplier × critMultiplier × blockMultiplier)`.

**Validates: Requirements 8.1**

---

### Property 10: STAB Multiplier

*For any* bird and move pair:
- Primary-colour bird using a move of its own colour → STAB multiplier is 1.5×.
- Secondary-colour bird using a move of its own colour or either constituent primary colour → STAB multiplier is 1.2×.
- All other combinations → STAB multiplier is 1×.

**Validates: Requirements 8.2, 8.3**

---

### Property 11: Type Effectiveness

*For any* attacker colour and defender colour, `getTypeMultiplier(attackColour, defenderColour)` must return 2× for super-effective matchups (per the primary and secondary cycles), 0.5× for not-very-effective matchups, and 1× for neutral matchups. Pink and Black must return 2× against each other and 1× against all other colours.

**Validates: Requirements 8.4, 8.5, 8.6**

---

### Property 12: Stat Stage Clamping

*For any* bird instance and any sequence of stat stage modifications, the resulting stage value for any stat must always remain in [−6, +6].

**Validates: Requirements 6.8, 8.7**

---

### Property 13: Switch Field Position Update

*For any* switch action (normal or reversal tag-in), after the switch resolves: the outgoing bird occupies the bench slot, the incoming bird occupies the active slot, and all stat stages of the outgoing bird are reset to 0.

**Validates: Requirements 9.4, 10.2, 10.3**

---

### Property 14: Reversal Incoming Bird Loses Next Action

*For any* reversal tag-in, the incoming bird's `skipNextAction` flag must be `true` after the reversal resolves.

**Validates: Requirements 9.5, 10.5**

---

### Property 15: End-of-Turn Status Effects

*For any* bird with an active status condition, after `applyEndOfTurn`:
- Bleed → HP reduced by `floor(maxHp / 8)`, STR stage −1, SPIRIT stage −1.
- Shaken → SPD stage −1 (accuracy penalty applied dynamically via Spirit).
- Bruised → recoil damage applied to attacker when it deals damage (15% of damage dealt, capped at 25% of attacker maxHp).

**Validates: Requirements 11.2, 11.3, 11.4**

---

### Property 16: Spirit Recovery

*For any* bird after `applyEndOfTurn`, its `currentSpirit` must increase by 5, capped at `bird.baseStats.spirit`.

**Validates: Requirements 11.5, 12.3**

---

### Property 17: Win Condition Detection

*For any* `BattleState` where both active birds of a player have `fainted = true`, `checkWinCondition` must return that player as the loser and the opponent as the winner.

**Validates: Requirements 11.6**

---

### Property 18: Match Score Tracking

*For any* sequence of battle results, the match's `p1Wins` and `p2Wins` counters must accurately reflect the number of battles won by each player, and when either counter reaches 2 the match must be marked `complete` with the correct winner.

**Validates: Requirements 2.6, 2.7**

---

### Property 19: Placement Validation

*For any* placement attempt with a count other than exactly 2 active birds and 1 bench bird, `confirmPlacement` must return an error and the `BattleState` must remain unchanged.

**Validates: Requirements 3.2, 3.3**

---

### Property 20: Move Round-Trip

*For any* valid `Move` record, `parseMove(printMove(move))` must produce an equivalent `Move` record (all fields equal). For any invalid move definition, `parseMove` must return an error identifying the offending field.

**Validates: Requirements 16.1, 16.2, 16.3, 16.4, 16.5**

---

### Property 21: Spirit Initialisation

*For any* `BattleState` at the start of a battle, every bird's `currentSpirit` must equal its `bird.baseStats.spirit`.

**Validates: Requirements 12.1**

---

## Testing Strategy

### Dual Testing Approach

Both unit tests and property-based tests are required. They are complementary:

- **Unit tests** catch concrete bugs with specific examples, integration points, and edge cases.
- **Property tests** verify universal correctness across the full input space.

### Property-Based Testing

The project uses **fast-check** (already present in the test suite via `scripts/sim.test.js`) for property-based testing.

Each property test must:
- Run a minimum of **100 iterations**.
- Include a comment referencing the design property it validates, in the format:
  `// Feature: chroma-battle-simulator, Property N: <property_text>`

Each correctness property above must be implemented by exactly one property-based test.

**Example test structure:**

```typescript
import * as fc from "fast-check"
import { describe, it } from "vitest"

describe("chroma-battle-simulator — Property 3: Resolution Queue Ordering", () => {
  it("higher priority always precedes lower priority in the queue", () => {
    // Feature: chroma-battle-simulator, Property 3: Resolution Queue Ordering
    fc.assert(
      fc.property(
        fc.array(arbitraryAction(), { minLength: 2, maxLength: 4 }),
        (actions) => {
          const queue = buildResolutionQueue(actions, mockRng())
          for (let i = 0; i < queue.length - 1; i++) {
            if (queue[i].priority !== queue[i + 1].priority) {
              return queue[i].priority > queue[i + 1].priority
            }
          }
          return true
        }
      ),
      { numRuns: 100 }
    )
  })
})
```

### Unit Testing

Unit tests should focus on:

- **Specific examples**: e.g. a known damage calculation with fixed stats.
- **Edge cases**: crit protection at exactly 50% HP, Weak power tier staying Weak after reduction, stat stage clamping at ±6.
- **Integration**: Server Action → Engine → Store round-trip for a full turn.
- **Error conditions**: invalid orders, wrong phase, missing battle.

Avoid writing unit tests that duplicate what property tests already cover (e.g. don't write 10 unit tests for different type matchups when Property 11 covers all of them).

### Test File Layout

```
lib/
  engine.test.ts       — unit + property tests for Battle Engine
  teamgen.test.ts      — unit + property tests for Team Generator
  moves.test.ts        — unit + property tests for Move Parser / Pretty-Printer
  store.test.ts        — unit tests for State Store
app/
  battle/
    __tests__/
      actions.test.ts  — integration tests for Server Actions
```

### Property Test Arbitraries

Shared arbitraries should be defined in `lib/test-utils/arbitraries.ts`:

- `arbitraryColour()` — one of the 8 valid colours
- `arbitraryMove()` — a fully valid `Move` record
- `arbitraryBird()` — a fully valid `Bird` with 4 moves
- `arbitraryRoster()` — 3 distinct birds
- `arbitraryBirdInstance()` — a `BirdInstance` with valid HP/Spirit/stages
- `arbitraryOrderSet()` — two valid orders for a player's field
- `arbitraryBattleState()` — a `BattleState` in the `planning` phase
