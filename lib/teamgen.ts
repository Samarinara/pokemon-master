import type { RNG, Colour, Height, PowerTier, StatusCondition, Move, Bird, Roster } from "./types"

// ── Constants ────────────────────────────────────────────────────────────────

const COLOURS: Colour[] = ["Red", "Yellow", "Blue", "Orange", "Purple", "Green", "Pink", "Black"]

const HEIGHTS: Height[] = ["High", "Mid", "Low"]

const POWER_TIERS: PowerTier[] = ["Weak", "Normal", "Strong"]

const STATUS_CONDITIONS: StatusCondition[] = ["Bleed", "Shaken", "Bruised"]

// A pool of bird species names for generation
const BIRD_NAMES = [
  "Albatross", "Bittern", "Bunting", "Cassowary", "Chaffinch", "Condor",
  "Cormorant", "Crane", "Crossbill", "Cuckoo", "Curlew", "Dipper",
  "Dotterel", "Dunlin", "Egret", "Falcon", "Finch", "Flamingo",
  "Gannet", "Godwit", "Goldfinch", "Grebe", "Grosbeak", "Guillemot",
  "Harrier", "Heron", "Hoopoe", "Ibis", "Jackdaw", "Kestrel",
  "Kingfisher", "Kite", "Lapwing", "Linnet", "Loon", "Magpie",
  "Martin", "Merlin", "Moorhen", "Nightjar", "Nuthatch", "Oriole",
  "Osprey", "Ouzel", "Oystercatcher", "Partridge", "Peregrine", "Petrel",
  "Pheasant", "Pipit", "Plover", "Puffin", "Raven", "Razorbill",
  "Redshank", "Redstart", "Robin", "Rook", "Sanderling", "Sandpiper",
  "Shearwater", "Shoveler", "Siskin", "Skua", "Skylark", "Snipe",
  "Sparrowhawk", "Starling", "Stint", "Stonechat", "Stork", "Swallow",
  "Swift", "Teal", "Tern", "Thrush", "Tit", "Treecreeper",
  "Turnstone", "Twite", "Wagtail", "Warbler", "Wheatear", "Whimbrel",
  "Whitethroat", "Wigeon", "Woodcock", "Woodlark", "Woodpecker", "Wren",
  "Yellowhammer", "Yellowlegs",
]

// ── Helpers ──────────────────────────────────────────────────────────────────

function pick<T>(rng: RNG, arr: T[]): T {
  return arr[rng.nextInt(arr.length)]
}

function randInt(rng: RNG, min: number, max: number): number {
  // inclusive on both ends
  return min + rng.nextInt(max - min + 1)
}

function generateId(rng: RNG): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789"
  let id = ""
  for (let i = 0; i < 8; i++) {
    id += chars[rng.nextInt(chars.length)]
  }
  return id
}

// ── generateMove ─────────────────────────────────────────────────────────────

export function generateMove(rng: RNG, colour: Colour): Move {
  const height = pick(rng, HEIGHTS)
  const powerTier = pick(rng, POWER_TIERS)
  const accuracy = randInt(rng, 10, 100)
  const priority = randInt(rng, -2, 2)

  // Optional statStage (~30% chance)
  let statStage: Move["statStage"] | undefined
  if (rng.next() < 0.3) {
    const target = rng.next() < 0.5 ? "self" : "opponent"
    const stats = ["str", "guts", "spd", "spirit"] as const
    const stat = pick(rng, [...stats])
    const stagesOptions = [1, 2, -1, -2] as const
    const stages = pick(rng, [...stagesOptions])
    statStage = { target, stat, stages }
  }

  // Optional status (~25% chance)
  let status: Move["status"] | undefined
  if (rng.next() < 0.25) {
    const condition = pick(rng, STATUS_CONDITIONS)
    const procChance = randInt(rng, 10, 60)
    status = { condition, procChance }
  }

  const move: Move = {
    id: generateId(rng),
    name: `${colour} ${height} ${powerTier}`,
    colour,
    height,
    powerTier,
    accuracy,
    priority,
    flags: {
      reversalLegal: rng.next() < 0.4,
      switchAttackLegal: rng.next() < 0.4,
      contact: rng.next() < 0.6,
      special: rng.next() < 0.4,
    },
  }

  if (statStage !== undefined) move.statStage = statStage
  if (status !== undefined) move.status = status

  return move
}

// ── generateBird ─────────────────────────────────────────────────────────────

export function generateBird(rng: RNG, existingNames: Set<string>): Bird {
  const colour = pick(rng, COLOURS)

  const baseStats = {
    hp: randInt(rng, 120, 220),
    str: randInt(rng, 60, 140),
    guts: randInt(rng, 60, 140),
    spd: randInt(rng, 60, 140),
    spirit: randInt(rng, 60, 140),
  }

  const moves: Move[] = []
  for (let i = 0; i < 4; i++) {
    moves.push(generateMove(rng, colour))
  }

  // Retry name selection up to 10 attempts to avoid collision
  let name: string | undefined
  for (let attempt = 0; attempt < 10; attempt++) {
    const candidate = pick(rng, BIRD_NAMES)
    if (!existingNames.has(candidate)) {
      name = candidate
      break
    }
  }
  // Fallback: append a random suffix if all attempts collided
  if (name === undefined) {
    name = pick(rng, BIRD_NAMES) + "_" + generateId(rng).slice(0, 4)
  }

  return {
    id: generateId(rng),
    name,
    colour,
    baseStats,
    moves,
  }
}

// ── generateRoster ────────────────────────────────────────────────────────────

export function generateRoster(rng: RNG): Roster {
  const existingNames = new Set<string>()
  const birds: Bird[] = []

  for (let i = 0; i < 3; i++) {
    const bird = generateBird(rng, existingNames)
    existingNames.add(bird.name)
    birds.push(bird)
  }

  return { birds: birds as [Bird, Bird, Bird] }
}
