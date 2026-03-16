// ── Enums ──────────────────────────────────────────────────────────────────

export type Colour = "Red" | "Yellow" | "Blue" | "Orange" | "Purple" | "Green" | "Pink" | "Black"
export type Height = "High" | "Mid" | "Low"
export type PowerTier = "Weak" | "Normal" | "Strong" // base: 40 / 70 / 100
export type StatusCondition = "Bleed" | "Shaken" | "Bruised"
export type Player = "p1" | "p2"
export type Slot = "left" | "right" | "bench"

// ── Move ───────────────────────────────────────────────────────────────────

export interface Move {
  id: string
  name: string
  colour: Colour
  height: Height
  powerTier: PowerTier
  accuracy: number // 10–100
  priority: number // integer, default 0
  statStage?: {
    target: "self" | "opponent"
    stat: keyof Stats
    stages: 1 | 2 | -1 | -2
  }
  status?: {
    condition: StatusCondition
    procChance: number // 0–100
  }
  flags: {
    reversalLegal: boolean
    switchAttackLegal: boolean
    contact: boolean
    special: boolean
  }
}

// ── Bird ───────────────────────────────────────────────────────────────────

export interface Stats {
  hp: number     // 120–220
  str: number    // 60–140
  guts: number   // 60–140
  spd: number    // 60–140
  spirit: number // 60–140
}

export interface Bird {
  id: string
  name: string
  colour: Colour
  baseStats: Stats
  moves: Move[] // exactly 4
}

// ── In-battle Bird instance ────────────────────────────────────────────────

export interface BirdInstance {
  bird: Bird
  currentHp: number
  currentSpirit: number
  statStages: Record<keyof Omit<Stats, "hp">, number> // –6 to +6
  status: StatusCondition | null
  skipNextAction: boolean // set after reversal tag-in
  fainted: boolean
}

// ── Roster & Field ─────────────────────────────────────────────────────────

export interface Roster {
  birds: [Bird, Bird, Bird] // exactly 3, no duplicates
}

export interface PlayerField {
  left: BirdInstance
  right: BirdInstance
  bench: BirdInstance
}

// ── Orders ─────────────────────────────────────────────────────────────────

export type AttackOrder = { type: "attack"; slot: Slot; moveId: string; targetSlot: Slot }
export type BlockOrder = { type: "block"; slot: Slot; height: "High" | "Low" }
export type SwitchOrder = { type: "switch"; slot: Slot; switchAttackMoveId?: string }

export type Order = AttackOrder | BlockOrder | SwitchOrder

export interface OrderSet {
  left: Order
  right: Order
}

// ── Resolution Queue ───────────────────────────────────────────────────────

export interface ResolvedAction {
  player: Player
  slot: Slot
  order: Order
  priority: number   // from move.priority, or 0 for block/switch
  spd: number        // acting bird's current effective SPD
  tieBreaker: number // server RNG value, used only when priority + spd both tie
}

// ── Battle State ───────────────────────────────────────────────────────────

export type BattlePhase =
  | "placement_p1"
  | "placement_p2"
  | "planning"
  | "awaiting_p2_orders"
  | "resolving"
  | "reversal_window"
  | "end_of_turn"
  | "battle_ended"

export interface BattleState {
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

export interface ReversalWindowState {
  defendingPlayer: Player
  defendingSlot: Slot
  timeoutMs: number
}

export interface LogEntry {
  turn: number
  text: string
}

// ── Match State ────────────────────────────────────────────────────────────

export interface MatchState {
  id: string
  p1Wins: number
  p2Wins: number
  battles: string[] // battle IDs in order
  winner: Player | null
  complete: boolean
}

// ── Placement ──────────────────────────────────────────────────────────────

export interface PlacementOrder {
  leftBirdId: string
  rightBirdId: string
  benchBirdId: string
}

// ── Result type (for Move Parser) ──────────────────────────────────────────

export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E }

export interface ValidationError {
  field: string
  message: string
}

// ── RNG ────────────────────────────────────────────────────────────────────

export interface RNG {
  next(): number          // returns [0, 1)
  nextInt(max: number): number
}

// ── Win Result ─────────────────────────────────────────────────────────────

export interface WinResult {
  winner: Player
  loser: Player
}
