import type { BattleState, Player } from "../types"

// ── Lobby ──────────────────────────────────────────────────────────────────

export type LobbyState = "waiting" | "pending_acceptance" | "in_progress" | "complete"

export interface Session {
  joinCode: string // normalised to uppercase
  lobbyState: LobbyState
  host: SessionPlayer
  joiner: SessionPlayer | null
  battleId: string | null // set when in_progress
  createdAt: number // Unix ms
  updatedAt: number
  acceptanceDeadline: number | null // Unix ms, set when pending_acceptance
}

export interface SessionPlayer {
  displayName: string
  token: string // opaque UUID, server-issued
  player: Player | null // assigned when battle starts
  connectedAt: number
}

// ── Validation ─────────────────────────────────────────────────────────────

export interface MatchmakingInput {
  displayName: string // 1–24 chars
  joinCode: string // 1–16 alphanumeric chars, normalised to uppercase
}

// ── SSE Events (client-facing) ─────────────────────────────────────────────

export type SSEEvent =
  | { type: "session_updated"; session: Session }
  | { type: "battle_started"; battleId: string; yourPlayer: "p1" | "p2"; token: string }
  | { type: "session_declined" }
  | { type: "session_expired" }
  | { type: "battle_state_updated"; state: BattleState }
