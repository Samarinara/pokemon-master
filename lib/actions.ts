"use server"

import type {
  BattleState,
  OrderSet,
  PlacementOrder,
  Player,
  BirdInstance,
  Bird,
  MatchState,
} from "./types"
import {
  saveBattle,
  loadBattle,
  deleteBattle as deleteBattleFromStore,
  savePendingOrders,
  loadPendingOrders,
  saveMatch,
  loadMatch,
  saveDb,
  clearPendingOrders,
} from "./store"
import { resolveTurn, applyEndOfTurn } from "./engine"
import { generateRoster } from "./teamgen"
import { createRng } from "./rng"

function makeBirdInstance(bird: Bird): BirdInstance {
  return {
    bird,
    currentHp: bird.baseStats.hp,
    currentSpirit: bird.baseStats.spirit,
    statStages: { str: 0, guts: 0, spd: 0, spirit: 0 },
    status: null,
    skipNextAction: false,
    fainted: false,
  }
}

export async function startBattle(): Promise<BattleState> {
  const rng = createRng()
  const matchId = crypto.randomUUID()
  const battleId = crypto.randomUUID()

  const p1Roster = generateRoster(rng)
  const p2Roster = generateRoster(rng)

  const match: MatchState = {
    id: matchId,
    p1Wins: 0,
    p2Wins: 0,
    battles: [battleId],
    winner: null,
    complete: false,
  }
  await saveMatch(match)

  const [p1b0, p1b1, p1b2] = p1Roster.birds
  const [p2b0, p2b1, p2b2] = p2Roster.birds

  const state: BattleState = {
    id: battleId,
    matchId,
    phase: "placement_p1",
    turn: 0,
    p1Field: {
      left: makeBirdInstance(p1b0),
      right: makeBirdInstance(p1b1),
      bench: makeBirdInstance(p1b2),
    },
    p2Field: {
      left: makeBirdInstance(p2b0),
      right: makeBirdInstance(p2b1),
      bench: makeBirdInstance(p2b2),
    },
    pendingOrders: {},
    resolutionQueue: [],
    currentQueueIndex: 0,
    reversalWindow: null,
    battleLog: [],
    winner: null,
    createdAt: Date.now(),
  }

  await saveBattle(state)
  saveDb()
  return state
}

export async function confirmPlacement(
  battleId: string,
  player: "p1" | "p2",
  placement: PlacementOrder
): Promise<BattleState | { error: "INVALID_PLACEMENT" }> {
  const state = await loadBattle(battleId)
  if (!state) return { error: "INVALID_PLACEMENT" }

  const field = player === "p1" ? state.p1Field : state.p2Field
  const allInstances = [field.left, field.right, field.bench]
  const validIds = new Set(allInstances.map((i) => i.bird.id))

  const { leftBirdId, rightBirdId, benchBirdId } = placement

  // All three must be distinct
  const placedIds = new Set([leftBirdId, rightBirdId, benchBirdId])
  if (placedIds.size !== 3) return { error: "INVALID_PLACEMENT" }

  // All three must be valid bird IDs from the player's roster
  if (!validIds.has(leftBirdId) || !validIds.has(rightBirdId) || !validIds.has(benchBirdId)) {
    return { error: "INVALID_PLACEMENT" }
  }

  const findInstance = (id: string): BirdInstance => {
    const inst = allInstances.find((i) => i.bird.id === id)!
    return { ...inst, currentSpirit: inst.bird.baseStats.spirit }
  }

  const newField = {
    left: findInstance(leftBirdId),
    right: findInstance(rightBirdId),
    bench: findInstance(benchBirdId),
  }

  const nextPhase = state.phase === "placement_p1" ? "placement_p2" : "planning"

  const updated: BattleState = {
    ...state,
    phase: nextPhase,
    [player === "p1" ? "p1Field" : "p2Field"]: newField,
  }

  await saveBattle(updated)
  saveDb()
  return updated
}

export async function submitOrders(
  battleId: string,
  player: "p1" | "p2",
  orders: OrderSet
): Promise<BattleState> {
  const state = await loadBattle(battleId)
  if (!state) throw new Error(`Battle ${battleId} not found`)

  await savePendingOrders(battleId, player, orders)

  const pending = await loadPendingOrders(battleId)

  if (pending.p1 && pending.p2) {
    const rng = createRng()
    const resolved = resolveTurn(state, pending.p1, pending.p2, rng)
    const afterEot = applyEndOfTurn(resolved, rng)

    await clearPendingOrders(battleId)

    const finalState: BattleState = { ...afterEot, pendingOrders: {} }
    await saveBattle(finalState)
    saveDb()
    return finalState
  }

  // Only one player has submitted — record it in state and return
  const updatedState: BattleState = {
    ...state,
    pendingOrders: {
      ...state.pendingOrders,
      [player]: orders,
    },
  }
  await saveBattle(updatedState)
  saveDb()
  return updatedState
}

export async function getState(battleId: string): Promise<BattleState | null> {
  return loadBattle(battleId)
}

export async function deleteBattle(battleId: string): Promise<void> {
  await deleteBattleFromStore(battleId)
  saveDb()
}

export async function getMatch(matchId: string): Promise<MatchState | null> {
  return loadMatch(matchId)
}
