# Design Document: Netplay Matchmaking

## Overview

Netplay Matchmaking adds online multiplayer to the Chroma Battle Simulator. Two players on separate devices find each other using a shared join code. One player creates a lobby (Host); the other enters the same code to join (Joiner). The system manages lobby lifecycle (`waiting` → `pending_acceptance` → `in_progress`), real-time state synchronisation via Server-Sent Events, and graceful handling of disconnects, timeouts, and code collisions.

The existing Battle Engine (`lib/engine.ts`) is untouched. The only change to the battle layer is that `submitOrders` must now validate a session token before accepting an order, and the BattleClient must connect to a per-battle SSE stream instead of relying on local React state.

### Key Design Decisions

- **Server-Sent Events (SSE) over WebSockets**: Next.js App Router supports streaming responses natively. SSE is unidirectional (server → client), which is sufficient for lobby and battle state pushes. Clients send orders via existing Server Actions (POST). This avoids a separate WebSocket server.
- **Session stored in SQLite**: Reuses the existing `data/battles.db` via `lib/store.ts`. A new `sessions` table holds lobby state.
- **Session token per player**: When a player joins a session, the server issues a short-lived opaque token stored in a `sessionStorage` cookie. `submitOrders` checks this token to prevent cross-player order injection.
- **Polling fallback**: If the SSE connection drops, the client falls back to polling `getSessionState` every 2 seconds and displays a reconnecting indicator.

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│  CLIENT A (Host browser)          CLIENT B (Joiner browser)      │
│  ┌──────────────────────┐         ┌──────────────────────┐       │
│  │  MatchmakingForm     │         │  MatchmakingForm     │       │
│  │  WaitingScreen       │         │  JoinPrompt          │       │
│  │  AcceptancePrompt    │         │  WaitingForHost      │       │
│  │  BattleClient        │         │  BattleClient        │       │
│  └──────────┬───────────┘         └──────────┬───────────┘       │
│             │ SSE + Server Actions            │ SSE + Server Actions│
└─────────────┼───────────────────────────────-┼───────────────────┘
              │                                │
┌─────────────┼────────────────────────────────┼───────────────────┐
│  SERVER (Next.js)                                                 │
│  ┌──────────▼────────────────────────────────▼────────────────┐  │
│  │  Matchmaking Actions (lib/matchmaking/actions.ts)          │  │
│  │  createOrJoinSession · acceptJoiner · declineJoiner        │  │
│  │  getSessionState · disconnectFromSession                   │  │
│  └──────────┬────────────────────────────────────────────────┘  │
│             │                                                     │
│  ┌──────────▼────────────────────────────────────────────────┐   │
│  │  Session Store (lib/matchmaking/sessionStore.ts)          │   │
│  │  saveSession · loadSession · deleteSession                │   │
│  │  expireStaleWaitingSessions                               │   │
│  └──────────┬────────────────────────────────────────────────┘   │
│             │                                                     │
│  ┌──────────▼────────────────────────────────────────────────┐   │
│  │  SSE Broadcaster (lib/matchmaking/broadcaster.ts)         │   │
│  │  subscribe(sessionId, res) · publish(sessionId, event)    │   │
│  └───────────────────────────────────────────────────────────┘   │
│                                                                   │
│  ┌────────────────────────────────────────────────────────────┐   │
│  │  Existing: lib/actions.ts  ←  extended with token check   │   │
│  │  Existing: lib/engine.ts   ←  unchanged                   │   │
│  │  Existing: lib/store.ts    ←  unchanged                   │   │
│  └────────────────────────────────────────────────────────────┘   │
└───────────────────────────────────────────────────────────────────┘
```

### Data Flow — Lobby

1. Host submits name + code → `createOrJoinSession` → new `Session` with `waiting` state → Host receives `hostToken`, navigates to `/lobby/[code]`.
2. Joiner submits same code → `createOrJoinSession` → sees `waiting` session → Joiner receives `joinerToken`, UI shows "[HostName] is waiting…" prompt.
3. Joiner clicks Accept → `joinSession` → session transitions to `pending_acceptance` → SSE pushes `pending_acceptance` event to Host.
4. Host sees `AcceptancePrompt` → clicks Accept → `acceptJoiner` → session transitions to `in_progress`, `startBattle()` called → both clients receive `battle_started` event with `battleId`.
5. Both clients navigate to `/battle/[battleId]` with their respective player tokens.

### Data Flow — Battle (Netplay)

- Each client connects to `/api/battle/[id]/stream` SSE endpoint.
- Client submits orders via `submitOrders(battleId, player, orders, sessionToken)`.
- Server validates token, saves pending orders; when both arrive, resolves turn, pushes updated `BattleState` to both SSE streams.

---

## Components and Interfaces

### Matchmaking Actions (`lib/matchmaking/actions.ts`)

```typescript
"use server"

// Returns the session state and a player token for the caller.
export async function createOrJoinSession(
  displayName: string,
  joinCode: string
): Promise<
  | { status: "created"; session: Session; token: string }
  | { status: "waiting"; session: Session; token: string }
  | { status: "in_progress" }
  | { status: "validation_error"; field: "displayName" | "joinCode"; message: string }
>

// Host accepts the pending joiner.
export async function acceptJoiner(
  joinCode: string,
  hostToken: string
): Promise<{ battleId: string } | { error: "NOT_HOST" | "WRONG_PHASE" }>

// Host declines the pending joiner (or timeout fires).
export async function declineJoiner(
  joinCode: string,
  hostToken: string
): Promise<void>

// Joiner explicitly cancels before host responds.
export async function cancelJoin(
  joinCode: string,
  joinerToken: string
): Promise<void>

// Polled by client as fallback when SSE is unavailable.
export async function getSessionState(
  joinCode: string,
  token: string
): Promise<Session | null>

// Called on page unload / disconnect.
export async function disconnectFromSession(
  joinCode: string,
  token: string
): Promise<void>
```

### Session Store (`lib/matchmaking/sessionStore.ts`)

```typescript
export async function saveSession(session: Session): Promise<void>
export async function loadSession(joinCode: string): Promise<Session | null>
export async function deleteSession(joinCode: string): Promise<void>
export async function expireStaleWaitingSessions(olderThanMs: number): Promise<void>
```

### SSE Broadcaster (`lib/matchmaking/broadcaster.ts`)

In-process pub/sub using Node.js `EventEmitter`. Each SSE connection registers a listener; the broadcaster emits events when session state changes.

```typescript
export function subscribe(sessionId: string, onEvent: (event: SSEEvent) => void): () => void
export function publish(sessionId: string, event: SSEEvent): void

type SSEEvent =
  | { type: "session_updated"; session: Session }
  | { type: "battle_started"; battleId: string; yourPlayer: Player }
  | { type: "session_declined" }
  | { type: "session_expired" }
  | { type: "battle_state_updated"; state: BattleState }
```

### SSE Route Handlers

- `app/api/lobby/[code]/stream/route.ts` — lobby state stream (token required in query param)
- `app/api/battle/[id]/stream/route.ts` — battle state stream (token required in query param)

### Extended `submitOrders` signature

```typescript
// lib/actions.ts — existing function extended with token parameter
export async function submitOrders(
  battleId: string,
  player: "p1" | "p2",
  orders: OrderSet,
  sessionToken: string   // NEW — validated against session record
): Promise<BattleState>
```

### UI Components

| Component | Path | Responsibility |
|-----------|------|----------------|
| `MatchmakingForm` | `components/matchmaking/MatchmakingForm.tsx` | Name + code entry, client-side validation |
| `WaitingScreen` | `components/matchmaking/WaitingScreen.tsx` | "Waiting for opponent…" spinner, SSE connection |
| `JoinPrompt` | `components/matchmaking/JoinPrompt.tsx` | "[Host] is waiting" — Accept / Change Code |
| `AcceptancePrompt` | `components/matchmaking/AcceptancePrompt.tsx` | Host sees joiner name — Accept / Decline + 30s timer |
| `WaitingForHost` | `components/matchmaking/WaitingForHost.tsx` | Joiner waits for host decision |
| `ConnectionStatus` | `components/matchmaking/ConnectionStatus.tsx` | SSE health indicator (connected / reconnecting / error) |
| `LobbyPage` | `app/lobby/[code]/page.tsx` | Orchestrates lobby UI based on session phase |

---

## Data Models

```typescript
// ── Session ────────────────────────────────────────────────────────────────

type LobbyState = "waiting" | "pending_acceptance" | "in_progress" | "complete"

interface Session {
  joinCode: string          // normalised to uppercase
  lobbyState: LobbyState
  host: SessionPlayer
  joiner: SessionPlayer | null
  battleId: string | null   // set when in_progress
  createdAt: number         // Unix ms
  updatedAt: number
  acceptanceDeadline: number | null  // Unix ms, set when pending_acceptance
}

interface SessionPlayer {
  displayName: string
  token: string             // opaque UUID, server-issued
  player: "p1" | "p2" | null  // assigned when battle starts
  connectedAt: number
}

// ── Validation ─────────────────────────────────────────────────────────────

interface MatchmakingInput {
  displayName: string   // 1–24 chars
  joinCode: string      // 1–16 alphanumeric chars, normalised to uppercase
}

// ── SSE Events (client-facing) ─────────────────────────────────────────────

type SSEEvent =
  | { type: "session_updated"; session: Session }
  | { type: "battle_started"; battleId: string; yourPlayer: "p1" | "p2" }
  | { type: "session_declined" }
  | { type: "session_expired" }
  | { type: "battle_state_updated"; state: BattleState }
```

### SQLite Schema Extension

```sql
CREATE TABLE IF NOT EXISTS sessions (
  join_code          TEXT PRIMARY KEY,   -- uppercase normalised
  lobby_state        TEXT NOT NULL CHECK(lobby_state IN ('waiting','pending_acceptance','in_progress','complete')),
  host_name          TEXT NOT NULL,
  host_token         TEXT NOT NULL,
  joiner_name        TEXT,
  joiner_token       TEXT,
  battle_id          TEXT,
  acceptance_deadline INTEGER,           -- Unix ms, nullable
  created_at         INTEGER NOT NULL,
  updated_at         INTEGER NOT NULL
);
```

The `sessions` table is added to the existing `data/battles.db` via the same `initDb()` migration pattern used in `lib/store.ts`.

---

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Input Validation Rejects Invalid Inputs

*For any* display name or join code that is empty, exceeds its maximum length, or contains non-alphanumeric characters, `createOrJoinSession` must return a `validation_error` result and no session must be created or modified.

**Validates: Requirements 1.1, 1.2, 1.3, 1.5**

---

### Property 2: Join Code Case Normalisation

*For any* join code string composed of alphanumeric characters, `createOrJoinSession` called with the lowercase version and the uppercase version of that code must resolve to the same session.

**Validates: Requirements 1.4**

---

### Property 3: Session Creation on New Code

*For any* valid display name and join code that does not match an existing session, `createOrJoinSession` must return `status: "created"` and a session with `lobbyState: "waiting"` must exist in the store.

**Validates: Requirements 2.1, 2.2**

---

### Property 4: In-Progress Code Is Rejected

*For any* session in `lobbyState: "in_progress"`, calling `createOrJoinSession` with that session's join code must return `status: "in_progress"` and must not modify the session.

**Validates: Requirements 5.1, 5.2, 5.3**

---

### Property 5: Acceptance Timeout Reverts to Waiting

*For any* session in `pending_acceptance` whose `acceptanceDeadline` has passed, the session must transition back to `lobbyState: "waiting"` with `joiner` cleared, as if the host had declined.

**Validates: Requirements 3.5**

---

### Property 6: Session Expiry Releases Join Code

*For any* session that has been in `lobbyState: "waiting"` for more than 10 minutes, `expireStaleWaitingSessions` must delete that session so the join code becomes available again.

**Validates: Requirements 6.4**

---

### Property 7: Token Authorisation for Order Submission

*For any* battle with two registered player tokens, `submitOrders` called with a token that does not match the claimed player must be rejected and the battle state must remain unchanged.

**Validates: Requirements 8.3**

---

### Property 8: Simultaneous Order Resolution

*For any* battle in the `planning` phase, when both players submit valid orders (each with the correct token), `submitOrders` must resolve the turn exactly once and push the same updated `BattleState` to both players.

**Validates: Requirements 8.4, 8.5**

---

## Error Handling

| Scenario | Handling |
|----------|----------|
| Empty display name or join code | Client validation error; no server call made |
| Display name > 24 chars or join code > 16 chars | Client validation error; no server call made |
| Join code contains non-alphanumeric characters | Client validation error with distinct message |
| Join code matches `in_progress` session | Server returns `status: "in_progress"`; client shows error and clears code field |
| Host acceptance timeout (30 s) | Server auto-declines; session returns to `waiting`; joiner notified via SSE |
| Session waiting timeout (10 min) | `expireStaleWaitingSessions` deletes session; join code freed |
| Host disconnects while `waiting` | `disconnectFromSession` deletes session; join code freed |
| Joiner disconnects after acceptance, before battle | Session returns to `waiting`; host notified via SSE |
| SSE connection lost | Client retries for 15 s with reconnecting indicator; on failure returns to entry form |
| Invalid session token on `submitOrders` | Server returns `{ error: "INVALID_TOKEN" }`; client shows error |
| Late order submission (turn already resolving) | Server returns `{ error: "TURN_ALREADY_RESOLVED" }`; client ignores |
| Session not found | Server returns `null`; client returns to entry form |

---

## Testing Strategy

### Dual Testing Approach

Both unit tests and property-based tests are required and complementary:

- **Unit tests**: specific examples, integration points, error conditions, and SSE event sequences.
- **Property tests**: universal correctness across all valid inputs using **fast-check**.

### Property-Based Testing

The project uses **fast-check** (already present). Each property test must:
- Run a minimum of **100 iterations**.
- Include a comment in the format: `// Feature: netplay-matchmaking, Property N: <property_text>`
- Be implemented by exactly one property-based test.

### Unit Testing

Focus on:
- Specific examples: known valid/invalid inputs, exact session state transitions.
- Integration: `createOrJoinSession` → `acceptJoiner` → `startBattle` full flow.
- SSE: verify events are published when session state changes.
- Error conditions: wrong token, wrong phase, expired session.

### Test File Layout

```
lib/matchmaking/
  actions.test.ts       — unit + property tests for matchmaking actions
  sessionStore.test.ts  — unit tests for session store CRUD
  broadcaster.test.ts   — unit tests for SSE pub/sub
app/
  lobby/
    __tests__/
      lobbyFlow.test.ts — integration tests for full lobby lifecycle
```

### Arbitraries

Add to `lib/test-utils/arbitraries.ts`:
- `arbitraryDisplayName()` — string 1–24 alphanumeric chars
- `arbitraryJoinCode()` — string 1–16 alphanumeric chars (uppercase)
- `arbitraryInvalidDisplayName()` — empty string or length > 24
- `arbitraryInvalidJoinCode()` — empty, length > 16, or contains symbols
- `arbitrarySession()` — a `Session` in any `LobbyState`
