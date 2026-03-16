import { describe, it, expect, beforeEach } from "vitest"
import {
  saveBattle,
  loadBattle,
  deleteBattle,
  savePendingOrders,
  loadPendingOrders,
  saveMatch,
  loadMatch,
} from "./store"
import type { BattleState, MatchState, OrderSet, Bird, BirdInstance, PlayerField } from "./types"

// ── Fixtures ─────────────────────────────────────────────────────────────────

function makeBird(id: string): Bird {
  return {
    id,
    name: `Bird-${id}`,
    colour: "Red",
    baseStats: { hp: 150, str: 100, guts: 100, spd: 100, spirit: 100 },
    moves: [
      {
        id: "m1",
        name: "Peck",
        colour: "Red",
        height: "Mid",
        powerTier: "Normal",
        accuracy: 80,
        priority: 0,
        flags: { reversalLegal: false, switchAttackLegal: false, contact: true, special: false },
      },
      {
        id: "m2",
        name: "Slash",
        colour: "Blue",
        height: "High",
        powerTier: "Strong",
        accuracy: 70,
        priority: 0,
        flags: { reversalLegal: true, switchAttackLegal: false, contact: true, special: false },
      },
      {
        id: "m3",
        name: "Gust",
        colour: "Yellow",
        height: "Low",
        powerTier: "Weak",
        accuracy: 95,
        priority: 1,
        flags: { reversalLegal: false, switchAttackLegal: true, contact: false, special: true },
      },
      {
        id: "m4",
        name: "Tackle",
        colour: "Green",
        height: "Mid",
        powerTier: "Normal",
        accuracy: 90,
        priority: 0,
        flags: { reversalLegal: false, switchAttackLegal: false, contact: true, special: false },
      },
    ],
  }
}

function makeBirdInstance(id: string): BirdInstance {
  const bird = makeBird(id)
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

function makePlayerField(prefix: string): PlayerField {
  return {
    left: makeBirdInstance(`${prefix}-left`),
    right: makeBirdInstance(`${prefix}-right`),
    bench: makeBirdInstance(`${prefix}-bench`),
  }
}

function makeBattleState(id: string, matchId = "match-1"): BattleState {
  return {
    id,
    matchId,
    phase: "planning",
    turn: 1,
    p1Field: makePlayerField("p1"),
    p2Field: makePlayerField("p2"),
    pendingOrders: {},
    resolutionQueue: [],
    currentQueueIndex: 0,
    reversalWindow: null,
    battleLog: [{ turn: 1, text: "Battle started" }],
    winner: null,
    createdAt: 1700000000,
  }
}

function makeMatchState(id: string): MatchState {
  return {
    id,
    p1Wins: 1,
    p2Wins: 0,
    battles: ["battle-1"],
    winner: null,
    complete: false,
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("store — saveBattle / loadBattle round-trip", () => {
  it("saves and loads a BattleState correctly", async () => {
    const state = makeBattleState("battle-rt-1", "match-rt-1")
    await saveBattle(state)
    const loaded = await loadBattle("battle-rt-1")
    expect(loaded).not.toBeNull()
    expect(loaded!.id).toBe(state.id)
    expect(loaded!.matchId).toBe(state.matchId)
    expect(loaded!.phase).toBe(state.phase)
    expect(loaded!.turn).toBe(state.turn)
    expect(loaded!.winner).toBeNull()
    expect(loaded!.battleLog).toEqual(state.battleLog)
  })

  it("returns null for a non-existent battle", async () => {
    const result = await loadBattle("does-not-exist")
    expect(result).toBeNull()
  })

  it("upserts an existing battle on re-save", async () => {
    const state = makeBattleState("battle-upsert-1", "match-upsert-1")
    await saveBattle(state)
    const updated = { ...state, turn: 5, phase: "battle_ended" as const, winner: "p1" as const }
    await saveBattle(updated)
    const loaded = await loadBattle("battle-upsert-1")
    expect(loaded!.turn).toBe(5)
    expect(loaded!.phase).toBe("battle_ended")
    expect(loaded!.winner).toBe("p1")
  })
})

describe("store — savePendingOrders / loadPendingOrders", () => {
  const p1Orders: OrderSet = {
    left: { type: "attack", slot: "left", moveId: "m1", targetSlot: "left" },
    right: { type: "block", slot: "right", height: "High" },
  }
  const p2Orders: OrderSet = {
    left: { type: "block", slot: "left", height: "Low" },
    right: { type: "switch", slot: "right" },
  }

  beforeEach(async () => {
    // Ensure the battle exists before saving orders (FK-like dependency)
    await saveBattle(makeBattleState("battle-orders-1", "match-orders-1"))
  })

  it("saves and loads p1 orders", async () => {
    await savePendingOrders("battle-orders-1", "p1", p1Orders)
    const result = await loadPendingOrders("battle-orders-1")
    expect(result.p1).toEqual(p1Orders)
    expect(result.p2).toBeUndefined()
  })

  it("saves and loads p2 orders", async () => {
    await savePendingOrders("battle-orders-1", "p2", p2Orders)
    const result = await loadPendingOrders("battle-orders-1")
    expect(result.p2).toEqual(p2Orders)
  })

  it("saves and loads both p1 and p2 orders", async () => {
    await savePendingOrders("battle-orders-1", "p1", p1Orders)
    await savePendingOrders("battle-orders-1", "p2", p2Orders)
    const result = await loadPendingOrders("battle-orders-1")
    expect(result.p1).toEqual(p1Orders)
    expect(result.p2).toEqual(p2Orders)
  })

  it("upserts orders on re-save", async () => {
    const original: OrderSet = {
      left: { type: "block", slot: "left", height: "High" },
      right: { type: "block", slot: "right", height: "Low" },
    }
    await savePendingOrders("battle-orders-1", "p1", original)
    await savePendingOrders("battle-orders-1", "p1", p1Orders)
    const result = await loadPendingOrders("battle-orders-1")
    expect(result.p1).toEqual(p1Orders)
  })

  it("returns empty object when no orders exist", async () => {
    const result = await loadPendingOrders("battle-no-orders")
    expect(result.p1).toBeUndefined()
    expect(result.p2).toBeUndefined()
  })
})

describe("store — deleteBattle", () => {
  it("removes the battle and its pending orders", async () => {
    const state = makeBattleState("battle-del-1", "match-del-1")
    await saveBattle(state)
    const orders: OrderSet = {
      left: { type: "block", slot: "left", height: "High" },
      right: { type: "block", slot: "right", height: "Low" },
    }
    await savePendingOrders("battle-del-1", "p1", orders)
    await savePendingOrders("battle-del-1", "p2", orders)

    await deleteBattle("battle-del-1")

    const loaded = await loadBattle("battle-del-1")
    expect(loaded).toBeNull()

    const pending = await loadPendingOrders("battle-del-1")
    expect(pending.p1).toBeUndefined()
    expect(pending.p2).toBeUndefined()
  })

  it("is a no-op for a non-existent battle", async () => {
    await expect(deleteBattle("ghost-battle")).resolves.toBeUndefined()
  })
})

describe("store — saveMatch / loadMatch round-trip", () => {
  it("saves and loads a MatchState correctly", async () => {
    const match = makeMatchState("match-rt-1")
    await saveMatch(match)
    const loaded = await loadMatch("match-rt-1")
    expect(loaded).not.toBeNull()
    expect(loaded!.id).toBe(match.id)
    expect(loaded!.p1Wins).toBe(match.p1Wins)
    expect(loaded!.p2Wins).toBe(match.p2Wins)
    expect(loaded!.battles).toEqual(match.battles)
    expect(loaded!.winner).toBeNull()
    expect(loaded!.complete).toBe(false)
  })

  it("returns null for a non-existent match", async () => {
    const result = await loadMatch("no-such-match")
    expect(result).toBeNull()
  })

  it("upserts an existing match on re-save", async () => {
    const match = makeMatchState("match-upsert-1")
    await saveMatch(match)
    const updated: MatchState = {
      ...match,
      p1Wins: 2,
      winner: "p1",
      complete: true,
      battles: ["battle-1", "battle-2"],
    }
    await saveMatch(updated)
    const loaded = await loadMatch("match-upsert-1")
    expect(loaded!.p1Wins).toBe(2)
    expect(loaded!.winner).toBe("p1")
    expect(loaded!.complete).toBe(true)
    expect(loaded!.battles).toEqual(["battle-1", "battle-2"])
  })
})
