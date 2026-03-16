import type {
  Move,
  Roster,
  Bird,
  Stats,
  Colour,
  Height,
  PowerTier,
  StatusCondition,
  Result,
  ValidationError,
} from "./types"

// ── Valid value sets ────────────────────────────────────────────────────────

const VALID_COLOURS: Colour[] = ["Red", "Yellow", "Blue", "Orange", "Purple", "Green", "Pink", "Black"]
const VALID_HEIGHTS: Height[] = ["High", "Mid", "Low"]
const VALID_POWER_TIERS: PowerTier[] = ["Weak", "Normal", "Strong"]
const VALID_STATUS_CONDITIONS: StatusCondition[] = ["Bleed", "Shaken", "Bruised"]
const VALID_STATS: (keyof Stats)[] = ["hp", "str", "guts", "spd", "spirit"]
const VALID_STAT_STAGES = [1, 2, -1, -2] as const

// ── MoveDefinition — plain-object serialised form ──────────────────────────

export type MoveDefinition = {
  id: string
  name: string
  colour: string
  height: string
  powerTier: string
  accuracy: number
  priority: number
  statStage?: {
    target: "self" | "opponent"
    stat: string
    stages: number
  }
  status?: {
    condition: string
    procChance: number
  }
  flags: {
    reversalLegal: boolean
    switchAttackLegal: boolean
    contact: boolean
    special: boolean
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function err(field: string, message: string): Result<never, ValidationError> {
  return { ok: false, error: { field, message } }
}

function ok<T>(value: T): Result<T, ValidationError> {
  return { ok: true, value }
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v)
}

// ── parseMove ───────────────────────────────────────────────────────────────

export function parseMove(raw: unknown): Result<Move, ValidationError> {
  if (!isObject(raw)) {
    return err("root", "Move definition must be a plain object")
  }

  // id
  if (typeof raw.id !== "string" || raw.id.trim() === "") {
    return err("id", "id must be a non-empty string")
  }

  // name
  if (typeof raw.name !== "string" || raw.name.trim() === "") {
    return err("name", "name must be a non-empty string")
  }

  // colour
  if (!VALID_COLOURS.includes(raw.colour as Colour)) {
    return err("colour", `colour must be one of: ${VALID_COLOURS.join(", ")}`)
  }

  // height
  if (!VALID_HEIGHTS.includes(raw.height as Height)) {
    return err("height", `height must be one of: ${VALID_HEIGHTS.join(", ")}`)
  }

  // powerTier
  if (!VALID_POWER_TIERS.includes(raw.powerTier as PowerTier)) {
    return err("powerTier", `powerTier must be one of: ${VALID_POWER_TIERS.join(", ")}`)
  }

  // accuracy
  if (typeof raw.accuracy !== "number" || !Number.isFinite(raw.accuracy) || raw.accuracy < 10 || raw.accuracy > 100) {
    return err("accuracy", "accuracy must be a number between 10 and 100")
  }

  // priority
  const priority = raw.priority !== undefined ? raw.priority : 0
  if (typeof priority !== "number" || !Number.isInteger(priority)) {
    return err("priority", "priority must be an integer")
  }

  // statStage (optional)
  let statStage: Move["statStage"] | undefined
  if (raw.statStage !== undefined) {
    if (!isObject(raw.statStage)) {
      return err("statStage", "statStage must be an object")
    }
    const ss = raw.statStage
    if (ss.target !== "self" && ss.target !== "opponent") {
      return err("statStage.target", 'statStage.target must be "self" or "opponent"')
    }
    if (!VALID_STATS.includes(ss.stat as keyof Stats)) {
      return err("statStage.stat", `statStage.stat must be one of: ${VALID_STATS.join(", ")}`)
    }
    if (!(VALID_STAT_STAGES as readonly unknown[]).includes(ss.stages)) {
      return err("statStage.stages", "statStage.stages must be 1, 2, -1, or -2")
    }
    statStage = {
      target: ss.target as "self" | "opponent",
      stat: ss.stat as keyof Stats,
      stages: ss.stages as 1 | 2 | -1 | -2,
    }
  }

  // status (optional)
  let status: Move["status"] | undefined
  if (raw.status !== undefined) {
    if (!isObject(raw.status)) {
      return err("status", "status must be an object")
    }
    const s = raw.status
    if (!VALID_STATUS_CONDITIONS.includes(s.condition as StatusCondition)) {
      return err("status.condition", `status.condition must be one of: ${VALID_STATUS_CONDITIONS.join(", ")}`)
    }
    if (
      typeof s.procChance !== "number" ||
      !Number.isFinite(s.procChance) ||
      s.procChance < 0 ||
      s.procChance > 100
    ) {
      return err("status.procChance", "status.procChance must be a number between 0 and 100")
    }
    status = {
      condition: s.condition as StatusCondition,
      procChance: s.procChance as number,
    }
  }

  // flags
  if (!isObject(raw.flags)) {
    return err("flags", "flags must be an object")
  }
  const f = raw.flags
  for (const flag of ["reversalLegal", "switchAttackLegal", "contact", "special"] as const) {
    if (typeof f[flag] !== "boolean") {
      return err(`flags.${flag}`, `flags.${flag} must be a boolean`)
    }
  }

  const move: Move = {
    id: raw.id as string,
    name: raw.name as string,
    colour: raw.colour as Colour,
    height: raw.height as Height,
    powerTier: raw.powerTier as PowerTier,
    accuracy: raw.accuracy as number,
    priority: priority as number,
    flags: {
      reversalLegal: f.reversalLegal as boolean,
      switchAttackLegal: f.switchAttackLegal as boolean,
      contact: f.contact as boolean,
      special: f.special as boolean,
    },
  }

  if (statStage !== undefined) move.statStage = statStage
  if (status !== undefined) move.status = status

  return ok(move)
}

// ── printMove ───────────────────────────────────────────────────────────────

export function printMove(move: Move): MoveDefinition {
  const def: MoveDefinition = {
    id: move.id,
    name: move.name,
    colour: move.colour,
    height: move.height,
    powerTier: move.powerTier,
    accuracy: move.accuracy,
    priority: move.priority,
    flags: {
      reversalLegal: move.flags.reversalLegal,
      switchAttackLegal: move.flags.switchAttackLegal,
      contact: move.flags.contact,
      special: move.flags.special,
    },
  }

  if (move.statStage !== undefined) {
    def.statStage = {
      target: move.statStage.target,
      stat: move.statStage.stat,
      stages: move.statStage.stages,
    }
  }

  if (move.status !== undefined) {
    def.status = {
      condition: move.status.condition,
      procChance: move.status.procChance,
    }
  }

  return def
}

// ── parseRoster ─────────────────────────────────────────────────────────────

export function parseRoster(raw: unknown): Result<Roster, ValidationError> {
  if (!isObject(raw)) {
    return err("root", "Roster definition must be a plain object")
  }

  if (!Array.isArray(raw.birds)) {
    return err("birds", "birds must be an array")
  }

  if (raw.birds.length !== 3) {
    return err("birds", `birds must contain exactly 3 birds, got ${raw.birds.length}`)
  }

  const birds: Bird[] = []
  for (let i = 0; i < 3; i++) {
    const birdResult = parseBird(raw.birds[i], `birds[${i}]`)
    if (!birdResult.ok) return birdResult
    birds.push(birdResult.value)
  }

  // Check for duplicate ids
  const ids = birds.map((b) => b.id)
  const uniqueIds = new Set(ids)
  if (uniqueIds.size !== 3) {
    return err("birds", "All birds in the roster must have unique ids")
  }

  return ok({ birds: birds as [Bird, Bird, Bird] })
}

// ── parseBird (internal) ────────────────────────────────────────────────────

function parseBird(raw: unknown, prefix: string): Result<Bird, ValidationError> {
  if (!isObject(raw)) {
    return err(prefix, `${prefix} must be a plain object`)
  }

  if (typeof raw.id !== "string" || raw.id.trim() === "") {
    return err(`${prefix}.id`, `${prefix}.id must be a non-empty string`)
  }

  if (typeof raw.name !== "string" || raw.name.trim() === "") {
    return err(`${prefix}.name`, `${prefix}.name must be a non-empty string`)
  }

  if (!VALID_COLOURS.includes(raw.colour as Colour)) {
    return err(`${prefix}.colour`, `${prefix}.colour must be one of: ${VALID_COLOURS.join(", ")}`)
  }

  // baseStats
  const statsResult = parseStats(raw.baseStats, `${prefix}.baseStats`)
  if (!statsResult.ok) return statsResult

  // moves
  if (!Array.isArray(raw.moves)) {
    return err(`${prefix}.moves`, `${prefix}.moves must be an array`)
  }
  if (raw.moves.length !== 4) {
    return err(`${prefix}.moves`, `${prefix}.moves must contain exactly 4 moves, got ${raw.moves.length}`)
  }

  const moves: Move[] = []
  for (let i = 0; i < 4; i++) {
    const moveResult = parseMove(raw.moves[i])
    if (!moveResult.ok) {
      return err(`${prefix}.moves[${i}].${moveResult.error.field}`, moveResult.error.message)
    }
    moves.push(moveResult.value)
  }

  return ok({
    id: raw.id as string,
    name: raw.name as string,
    colour: raw.colour as Colour,
    baseStats: statsResult.value,
    moves,
  })
}

// ── parseStats (internal) ───────────────────────────────────────────────────

function parseStats(raw: unknown, prefix: string): Result<Stats, ValidationError> {
  if (!isObject(raw)) {
    return err(prefix, `${prefix} must be a plain object`)
  }

  const ranges: Record<keyof Stats, [number, number]> = {
    hp: [120, 220],
    str: [60, 140],
    guts: [60, 140],
    spd: [60, 140],
    spirit: [60, 140],
  }

  const stats: Partial<Stats> = {}
  for (const [stat, [min, max]] of Object.entries(ranges) as [keyof Stats, [number, number]][]) {
    const val = raw[stat]
    if (typeof val !== "number" || !Number.isInteger(val) || val < min || val > max) {
      return err(`${prefix}.${stat}`, `${prefix}.${stat} must be an integer between ${min} and ${max}`)
    }
    stats[stat] = val as number
  }

  return ok(stats as Stats)
}
