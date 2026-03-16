import { describe, it, expect, beforeEach } from "vitest"
import {
  saveSession,
  loadSession,
  deleteSession,
  expireStaleWaitingSessions,
} from "./sessionStore"
import type { Session } from "./types"

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    joinCode: "TESTCODE",
    lobbyState: "waiting",
    host: { displayName: "Alice", token: "host-token-1", player: null, connectedAt: 0 },
    joiner: null,
    battleId: null,
    acceptanceDeadline: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  }
}

describe("sessionStore", () => {
  beforeEach(async () => {
    // Clean up any leftover test sessions
    await deleteSession("TESTCODE")
    await deleteSession("ANOTHER")
    await deleteSession("STALE1")
    await deleteSession("STALE2")
    await deleteSession("FRESH1")
  })

  describe("saveSession / loadSession", () => {
    it("saves and loads a waiting session with no joiner", async () => {
      const session = makeSession()
      await saveSession(session)
      const loaded = await loadSession("TESTCODE")
      expect(loaded).not.toBeNull()
      expect(loaded!.joinCode).toBe("TESTCODE")
      expect(loaded!.lobbyState).toBe("waiting")
      expect(loaded!.host.displayName).toBe("Alice")
      expect(loaded!.host.token).toBe("host-token-1")
      expect(loaded!.joiner).toBeNull()
      expect(loaded!.battleId).toBeNull()
      expect(loaded!.acceptanceDeadline).toBeNull()
    })

    it("saves and loads a session with a joiner", async () => {
      const session = makeSession({
        lobbyState: "pending_acceptance",
        joiner: { displayName: "Bob", token: "joiner-token-1", player: null, connectedAt: 0 },
        acceptanceDeadline: Date.now() + 30_000,
      })
      await saveSession(session)
      const loaded = await loadSession("TESTCODE")
      expect(loaded!.lobbyState).toBe("pending_acceptance")
      expect(loaded!.joiner).not.toBeNull()
      expect(loaded!.joiner!.displayName).toBe("Bob")
      expect(loaded!.joiner!.token).toBe("joiner-token-1")
      expect(loaded!.joiner!.player).toBeNull()
      expect(loaded!.joiner!.connectedAt).toBe(0)
      expect(loaded!.acceptanceDeadline).toBeGreaterThan(Date.now())
    })

    it("saves and loads an in_progress session with battleId", async () => {
      const session = makeSession({
        lobbyState: "in_progress",
        joiner: { displayName: "Bob", token: "joiner-token-2", player: null, connectedAt: 0 },
        battleId: "battle-abc-123",
      })
      await saveSession(session)
      const loaded = await loadSession("TESTCODE")
      expect(loaded!.lobbyState).toBe("in_progress")
      expect(loaded!.battleId).toBe("battle-abc-123")
    })

    it("upserts an existing session on save", async () => {
      const session = makeSession()
      await saveSession(session)
      const updated = { ...session, lobbyState: "in_progress" as const, battleId: "battle-xyz" }
      await saveSession(updated)
      const loaded = await loadSession("TESTCODE")
      expect(loaded!.lobbyState).toBe("in_progress")
      expect(loaded!.battleId).toBe("battle-xyz")
    })

    it("normalises join code to uppercase on save", async () => {
      const session = makeSession({ joinCode: "testcode" })
      await saveSession(session)
      const loaded = await loadSession("TESTCODE")
      expect(loaded).not.toBeNull()
      expect(loaded!.joinCode).toBe("TESTCODE")
    })

    it("normalises join code to uppercase on load", async () => {
      const session = makeSession()
      await saveSession(session)
      const loaded = await loadSession("testcode")
      expect(loaded).not.toBeNull()
    })

    it("returns null for a non-existent join code", async () => {
      const loaded = await loadSession("DOESNOTEXIST")
      expect(loaded).toBeNull()
    })
  })

  describe("deleteSession", () => {
    it("deletes an existing session", async () => {
      await saveSession(makeSession())
      await deleteSession("TESTCODE")
      const loaded = await loadSession("TESTCODE")
      expect(loaded).toBeNull()
    })

    it("is a no-op for a non-existent session", async () => {
      await expect(deleteSession("NONEXISTENT")).resolves.toBeUndefined()
    })

    it("normalises join code to uppercase on delete", async () => {
      await saveSession(makeSession())
      await deleteSession("testcode")
      expect(await loadSession("TESTCODE")).toBeNull()
    })
  })

  describe("expireStaleWaitingSessions", () => {
    it("deletes waiting sessions older than the threshold", async () => {
      const old = makeSession({
        joinCode: "STALE1",
        createdAt: Date.now() - 20 * 60 * 1000, // 20 min ago
      })
      await saveSession(old)
      await expireStaleWaitingSessions(10 * 60 * 1000) // 10 min threshold
      expect(await loadSession("STALE1")).toBeNull()
    })

    it("keeps waiting sessions newer than the threshold", async () => {
      const fresh = makeSession({
        joinCode: "FRESH1",
        createdAt: Date.now() - 2 * 60 * 1000, // 2 min ago
      })
      await saveSession(fresh)
      await expireStaleWaitingSessions(10 * 60 * 1000)
      expect(await loadSession("FRESH1")).not.toBeNull()
    })

    it("does not delete non-waiting sessions even if old", async () => {
      const old = makeSession({
        joinCode: "STALE2",
        lobbyState: "in_progress",
        createdAt: Date.now() - 20 * 60 * 1000,
      })
      await saveSession(old)
      await expireStaleWaitingSessions(10 * 60 * 1000)
      expect(await loadSession("STALE2")).not.toBeNull()
      // cleanup
      await deleteSession("STALE2")
    })
  })
})
