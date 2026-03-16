import type {
  BattleState,
  BirdInstance,
  Bird,
  Move,
  OrderSet,
  ResolvedAction,
  Colour,
  Height,
  PowerTier,
  Stats,
  RNG,
  Player,
  PlayerField,
  Slot,
  Order,
  WinResult,
} from "./types"

// ── Constants ────────────────────────────────────────────────────────────────

const POWER_TIER_VALUES: Record<PowerTier, number> = {
  Weak: 40,
  Normal: 70,
  Strong: 100,
}

// Stat stage multipliers: stage → multiplier
// +1=×1.5, +2=×2.0, -1=×0.67, -2=×0.5; beyond ±2 extrapolated linearly
const STAGE_MULTIPLIERS: Record<number, number> = {
  "-6": 0.25,
  "-5": 0.29,
  "-4": 0.33,
  "-3": 0.4,
  "-2": 0.5,
  "-1": 0.67,
  "0": 1.0,
  "1": 1.5,
  "2": 2.0,
  "3": 2.5,
  "4": 3.0,
  "5": 3.5,
  "6": 4.0,
}

// ── Type chart ───────────────────────────────────────────────────────────────

// Primary cycle: Red → Yellow → Blue → Red (super-effective)
// i.e. Red is super-effective against Yellow, Yellow against Blue, Blue against Red
const PRIMARY_SUPER: Record<string, string> = {
  Red: "Yellow",
  Yellow: "Blue",
  Blue: "Red",
}

// Secondary cycle: Orange → Purple → Green → Orange (super-effective)
const SECONDARY_SUPER: Record<string, string> = {
  Orange: "Purple",
  Purple: "Green",
  Green: "Orange",
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

export function getStageMultiplier(stage: number): number {
  const clamped = clamp(stage, -6, 6)
  return STAGE_MULTIPLIERS[clamped] ?? 1.0
}

// ── getEffectiveSpd ──────────────────────────────────────────────────────────

export function getEffectiveSpd(instance: BirdInstance): number {
  const base = instance.bird.baseStats.spd
  const stage = instance.statStages.spd
  return base * getStageMultiplier(stage)
}

// ── buildResolutionQueue ─────────────────────────────────────────────────────

export function buildResolutionQueue(
  state: BattleState,
  p1Orders: OrderSet,
  p2Orders: OrderSet,
  rng: RNG
): ResolvedAction[] {
  const entries: Array<{ player: Player; slot: Slot; order: Order }> = [
    { player: "p1", slot: "left", order: p1Orders.left },
    { player: "p1", slot: "right", order: p1Orders.right },
    { player: "p2", slot: "left", order: p2Orders.left },
    { player: "p2", slot: "right", order: p2Orders.right },
  ]

  const actions: ResolvedAction[] = entries.map(({ player, slot, order }) => {
    const field = player === "p1" ? state.p1Field : state.p2Field
    const instance = field[slot as "left" | "right" | "bench"]

    // Priority: move.priority for Attack, 0 for Block/Switch
    let priority = 0
    if (order.type === "attack") {
      const move = instance.bird.moves.find((m) => m.id === order.moveId)
      priority = move?.priority ?? 0
    }

    const spd = getEffectiveSpd(instance)
    const tieBreaker = rng.next()

    return { player, slot, order, priority, spd, tieBreaker }
  })

  // Sort by [-priority, -spd, tieBreaker]
  actions.sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority
    if (b.spd !== a.spd) return b.spd - a.spd
    return a.tieBreaker - b.tieBreaker
  })

  return actions
}

// ── computeTrueAcc ───────────────────────────────────────────────────────────

export function computeTrueAcc(moveAcc: number, spirit: number): number {
  return clamp(moveAcc * (1 + (spirit - 60) / 400), 10, 100)
}

// ── getTypeMultiplier ────────────────────────────────────────────────────────

export function getTypeMultiplier(attackColour: Colour, defenderColour: Colour): number {
  // Pink and Black: 2× against each other, 1× against all others
  if (
    (attackColour === "Pink" && defenderColour === "Black") ||
    (attackColour === "Black" && defenderColour === "Pink")
  ) {
    return 2
  }
  if (attackColour === "Pink" || attackColour === "Black") {
    return 1
  }

  // Primary cycle super-effective: attack colour's target is defenderColour
  if (PRIMARY_SUPER[attackColour] === defenderColour) return 2
  // Primary cycle not-very-effective: defenderColour's target is attackColour
  // i.e. defender would be super-effective against attacker
  if (PRIMARY_SUPER[defenderColour] === attackColour) return 0.5

  // Secondary cycle super-effective
  if (SECONDARY_SUPER[attackColour] === defenderColour) return 2
  // Secondary cycle not-very-effective
  if (SECONDARY_SUPER[defenderColour] === attackColour) return 0.5

  return 1
}

// ── getStabMultiplier ────────────────────────────────────────────────────────

const SECONDARY_CONSTITUENTS: Record<string, [Colour, Colour]> = {
  Orange: ["Red", "Yellow"],
  Purple: ["Red", "Blue"],
  Green: ["Yellow", "Blue"],
}

export function getStabMultiplier(bird: Bird, move: Move): number {
  const birdColour = bird.colour
  const moveColour = move.colour

  // Pink and Black birds: 1× always
  if (birdColour === "Pink" || birdColour === "Black") return 1

  // Primary-colour bird using move of its own colour → 1.5×
  const primaryColours: Colour[] = ["Red", "Yellow", "Blue"]
  if (primaryColours.includes(birdColour) && moveColour === birdColour) return 1.5

  // Secondary-colour bird using move of its own colour OR either constituent primary → 1.2×
  const constituents = SECONDARY_CONSTITUENTS[birdColour]
  if (constituents !== undefined) {
    if (moveColour === birdColour || constituents.includes(moveColour)) return 1.2
  }

  return 1
}

// ── computeDamage ────────────────────────────────────────────────────────────

export function computeDamage(
  powerTier: PowerTier,
  str: number,
  guts: number,
  typeMultiplier: number,
  stabMultiplier: number,
  critMultiplier: number,
  blockMultiplier: number
): number {
  const base = POWER_TIER_VALUES[powerTier] * (str / 100)
  const afterGuts = base * (100 / (100 + guts))
  const afterType = afterGuts * typeMultiplier
  return Math.floor(afterType * stabMultiplier * critMultiplier * blockMultiplier)
}

// ── applyStatStage ───────────────────────────────────────────────────────────

export function applyStatStage(
  instance: BirdInstance,
  stat: keyof Omit<Stats, "hp">,
  stages: number
): BirdInstance {
  const current = instance.statStages[stat]
  const newStage = clamp(current + stages, -6, 6)
  return {
    ...instance,
    statStages: {
      ...instance.statStages,
      [stat]: newStage,
    },
  }
}

// ── checkWinCondition ────────────────────────────────────────────────────────

export function checkWinCondition(state: BattleState): WinResult | null {
  const p1Lost = state.p1Field.left.fainted && state.p1Field.right.fainted
  const p2Lost = state.p2Field.left.fainted && state.p2Field.right.fainted

  if (p1Lost) return { winner: "p2", loser: "p1" }
  if (p2Lost) return { winner: "p1", loser: "p2" }
  return null
}

// ── resolveAttackVsBlock ──────────────────────────────────────────────────────

export function resolveAttackVsBlock(
  attackHeight: Height,
  blockHeight: "High" | "Low",
  defenderInstance: BirdInstance
): { damageMultiplier: number; grantReversal: boolean; isCrit: boolean } {
  // Mid attack vs any block → normal damage, no reversal, no crit
  if (attackHeight === "Mid") {
    return { damageMultiplier: 1, grantReversal: false, isCrit: false }
  }

  // High or Low attack vs correct matching block → half damage, reversal granted
  if (attackHeight === blockHeight) {
    return { damageMultiplier: 0.5, grantReversal: true, isCrit: false }
  }

  // High or Low attack vs wrong block → crit (1.5×), no reversal
  return { damageMultiplier: 1.5, grantReversal: false, isCrit: true }
}

// ── applyCritProtection ───────────────────────────────────────────────────────

export function applyCritProtection(defenderInstance: BirdInstance, damage: number): number {
  const maxHp = defenderInstance.bird.baseStats.hp
  const preHitHp = defenderInstance.currentHp

  // Only applies when pre-hit HP was above 50% of maxHp
  if (preHitHp > maxHp / 2 && preHitHp - damage <= 0) {
    // Return adjusted damage so HP becomes 1
    return preHitHp - 1
  }

  return damage
}

// ── reducePowerTier ───────────────────────────────────────────────────────────

export function reducePowerTier(powerTier: PowerTier): PowerTier {
  if (powerTier === "Strong") return "Normal"
  if (powerTier === "Normal") return "Weak"
  return "Weak" // Weak stays Weak
}

// ── getField ──────────────────────────────────────────────────────────────────

export function getField(state: BattleState, player: Player): PlayerField {
  // PlayerField is already imported at the top of the file
  return player === "p1" ? state.p1Field : state.p2Field
}

// ── resolveSwitch ─────────────────────────────────────────────────────────────

export function resolveSwitch(
  state: BattleState,
  player: Player,
  slot: "left" | "right",
  switchAttackMoveId: string | undefined,
  rng: RNG
): BattleState {
  const field = player === "p1" ? state.p1Field : state.p2Field

  const outgoing = field[slot]
  const incoming = field.bench

  // Reset outgoing bird's stat stages to 0
  const resetOutgoing: BirdInstance = {
    ...outgoing,
    statStages: { str: 0, guts: 0, spd: 0, spirit: 0 },
  }

  // Incoming bird: clear skipNextAction (normal switch)
  const incomingActive: BirdInstance = {
    ...incoming,
    skipNextAction: false,
  }

  // Build updated field: incoming goes to active slot, outgoing goes to bench
  const updatedField = {
    ...field,
    [slot]: incomingActive,
    bench: resetOutgoing,
  }

  let newState: BattleState = {
    ...state,
    [player === "p1" ? "p1Field" : "p2Field"]: updatedField,
    battleLog: [
      ...state.battleLog,
      {
        turn: state.turn,
        text: `${player} switched out ${outgoing.bird.name} for ${incoming.bird.name}.`,
      },
    ],
  }

  // If a switch-attack move is provided, execute it at -1 power tier
  if (switchAttackMoveId !== undefined) {
    const move = incomingActive.bird.moves.find((m) => m.id === switchAttackMoveId)
    if (move && move.flags.switchAttackLegal) {
      const reducedTier = reducePowerTier(move.powerTier)
      const opponent = player === "p1" ? "p2" : "p1"
      const opponentField = player === "p1" ? newState.p2Field : newState.p1Field
      // Target the left slot of the opponent by default for switch-attack
      const defenderSlot: "left" | "right" = "left"
      const defender = opponentField[defenderSlot]

      if (!defender.fainted) {
        const attackerBird = incomingActive.bird
        const defenderBird = defender.bird
        const effectiveStr = attackerBird.baseStats.str * getStageMultiplier(incomingActive.statStages.str)
        const effectiveGuts = defenderBird.baseStats.guts * getStageMultiplier(defender.statStages.guts)
        const typeMultiplier = getTypeMultiplier(move.colour, defenderBird.colour)
        const stabMultiplier = getStabMultiplier(attackerBird, move)
        const damage = computeDamage(reducedTier, effectiveStr, effectiveGuts, typeMultiplier, stabMultiplier, 1, 1)

        const newHp = Math.max(0, defender.currentHp - damage)
        const fainted = newHp <= 0
        const updatedDefender: BirdInstance = {
          ...defender,
          currentHp: fainted ? 0 : newHp,
          fainted,
        }

        const updatedOpponentField = {
          ...opponentField,
          [defenderSlot]: updatedDefender,
        }

        newState = {
          ...newState,
          [opponent === "p1" ? "p1Field" : "p2Field"]: updatedOpponentField,
          battleLog: [
            ...newState.battleLog,
            {
              turn: newState.turn,
              text: `${incomingActive.bird.name} used ${move.name} as a switch-attack for ${damage} damage!`,
            },
          ],
        }
      }
    }
  }

  return newState
}

// ── applyEndOfTurn ────────────────────────────────────────────────────────────

export function applyEndOfTurn(state: BattleState, rng: RNG): BattleState {
  function applyStatusToInstance(instance: BirdInstance): BirdInstance {
    if (instance.fainted) return instance

    let updated = instance

    if (updated.status === "Bleed") {
      const bleedDmg = Math.floor(updated.bird.baseStats.hp / 8)
      const newHp = Math.max(0, updated.currentHp - bleedDmg)
      const fainted = newHp <= 0
      updated = { ...updated, currentHp: fainted ? 0 : newHp, fainted }
      updated = applyStatStage(updated, "str", -1)
      updated = applyStatStage(updated, "spirit", -1)
    }

    if (updated.status === "Shaken") {
      updated = applyStatStage(updated, "spd", -1)
    }

    // Bruised recoil is applied during attack resolution, not end-of-turn
    // (we don't track damage dealt per turn in current state)

    return updated
  }

  function recoverSpirit(instance: BirdInstance): BirdInstance {
    if (instance.fainted) return instance
    const maxSpirit = instance.bird.baseStats.spirit
    const newSpirit = Math.min(instance.currentSpirit + 5, maxSpirit)
    return { ...instance, currentSpirit: newSpirit }
  }

  function processField(field: typeof state.p1Field) {
    return {
      left: recoverSpirit(applyStatusToInstance(field.left)),
      right: recoverSpirit(applyStatusToInstance(field.right)),
      bench: recoverSpirit(applyStatusToInstance(field.bench)),
    }
  }

  const newP1Field = processField(state.p1Field)
  const newP2Field = processField(state.p2Field)

  let newState: BattleState = {
    ...state,
    p1Field: newP1Field,
    p2Field: newP2Field,
  }

  const winResult = checkWinCondition(newState)
  if (winResult !== null) {
    return {
      ...newState,
      winner: winResult.winner,
      phase: "battle_ended",
    }
  }

  return {
    ...newState,
    phase: "planning",
    turn: state.turn + 1,
  }
}

// ── resolveTurn ───────────────────────────────────────────────────────────────

export function resolveTurn(
  state: BattleState,
  p1Orders: OrderSet,
  p2Orders: OrderSet,
  rng: RNG
): BattleState {
  const queue = buildResolutionQueue(state, p1Orders, p2Orders, rng)

  let current: BattleState = {
    ...state,
    resolutionQueue: queue,
    currentQueueIndex: 0,
    phase: "resolving",
  }

  for (let i = 0; i < queue.length; i++) {
    const action = queue[i]
    const { player, slot, order } = action

    // Get the acting bird's current state
    const actingField = player === "p1" ? current.p1Field : current.p2Field
    const actingBird = actingField[slot as "left" | "right"]

    // Skip if acting bird has fainted
    if (actingBird.fainted) continue

    // Skip if bird has skipNextAction set
    if (actingBird.skipNextAction) {
      // Clear the flag for next turn
      const updatedActing: BirdInstance = { ...actingBird, skipNextAction: false }
      const updatedActingField = { ...actingField, [slot]: updatedActing }
      current = {
        ...current,
        [player === "p1" ? "p1Field" : "p2Field"]: updatedActingField,
      }
      continue
    }

    if (order.type === "attack") {
      const attackOrder = order
      const move = actingBird.bird.moves.find((m) => m.id === attackOrder.moveId)
      if (!move) continue

      const opponent: Player = player === "p1" ? "p2" : "p1"
      const opponentField = player === "p1" ? current.p2Field : current.p1Field
      const targetSlot = attackOrder.targetSlot as "left" | "right"
      const defender = opponentField[targetSlot]

      // Skip if target has fainted
      if (defender.fainted) continue

      // Accuracy check
      const trueAcc = computeTrueAcc(move.accuracy, actingBird.currentSpirit)
      const roll = rng.next() * 100
      if (roll >= trueAcc) {
        // Miss
        current = {
          ...current,
          battleLog: [
            ...current.battleLog,
            { turn: current.turn, text: `${actingBird.bird.name} used ${move.name} but missed!` },
          ],
        }
        continue
      }

      // Determine if defender is blocking
      const defenderOrder =
        player === "p1"
          ? targetSlot === "left"
            ? p2Orders.left
            : p2Orders.right
          : targetSlot === "left"
          ? p1Orders.left
          : p1Orders.right

      let damageMultiplier = 1
      let grantReversal = false
      let isCrit = false

      if (defenderOrder.type === "block") {
        const blockResult = resolveAttackVsBlock(move.height, defenderOrder.height, defender)
        damageMultiplier = blockResult.damageMultiplier
        grantReversal = blockResult.grantReversal
        isCrit = blockResult.isCrit
      }

      // Apply crit protection if needed
      const effectiveStr = actingBird.bird.baseStats.str * getStageMultiplier(actingBird.statStages.str)
      const effectiveGuts = defender.bird.baseStats.guts * getStageMultiplier(defender.statStages.guts)
      const typeMultiplier = getTypeMultiplier(move.colour, defender.bird.colour)
      const stabMultiplier = getStabMultiplier(actingBird.bird, move)
      const critMultiplier = isCrit ? 1.5 : 1

      let damage = computeDamage(
        move.powerTier,
        effectiveStr,
        effectiveGuts,
        typeMultiplier,
        stabMultiplier,
        critMultiplier,
        damageMultiplier
      )

      if (isCrit) {
        damage = applyCritProtection(defender, damage)
      }

      const newHp = Math.max(0, defender.currentHp - damage)
      const fainted = newHp <= 0

      let updatedDefender: BirdInstance = {
        ...defender,
        currentHp: fainted ? 0 : newHp,
        fainted,
      }

      // If crit, reduce defender spirit by 10
      if (isCrit) {
        updatedDefender = {
          ...updatedDefender,
          currentSpirit: Math.max(0, updatedDefender.currentSpirit - 10),
        }
      }

      const updatedOpponentField = {
        ...opponentField,
        [targetSlot]: updatedDefender,
      }

      current = {
        ...current,
        [opponent === "p1" ? "p1Field" : "p2Field"]: updatedOpponentField,
        battleLog: [
          ...current.battleLog,
          {
            turn: current.turn,
            text: `${actingBird.bird.name} used ${move.name} on ${defender.bird.name} for ${damage} damage!${isCrit ? " Critical hit!" : ""}${fainted ? ` ${defender.bird.name} fainted!` : ""}`,
          },
        ],
      }

      // Set reversal window if granted
      if (grantReversal) {
        current = {
          ...current,
          reversalWindow: {
            defendingPlayer: opponent,
            defendingSlot: targetSlot,
            timeoutMs: 3000,
          },
        }
      }
    } else if (order.type === "switch") {
      const switchOrder = order
      current = resolveSwitch(
        current,
        player,
        slot as "left" | "right",
        switchOrder.switchAttackMoveId,
        rng
      )
    } else if (order.type === "block") {
      // Block orders have no immediate effect — they are checked when attacks resolve
      // Just log it
      current = {
        ...current,
        battleLog: [
          ...current.battleLog,
          {
            turn: current.turn,
            text: `${actingBird.bird.name} is blocking ${order.height}!`,
          },
        ],
      }
    }

    current = { ...current, currentQueueIndex: i + 1 }
  }

  // Advance phase to end_of_turn
  current = {
    ...current,
    phase: "end_of_turn",
  }

  return current
}
