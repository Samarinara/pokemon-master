"use server"

import { startBattle } from "../actions"
import { loadSession, saveSession, deleteSession } from "./sessionStore"
import { validateMatchmakingInput, normaliseJoinCode } from "./validation"
import type { Session } from "./types"

// Broadcaster may not exist yet — import gracefully
let broadcaster: { publish: (sessionId: string, event: unknown) => void } | null = null
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  broadcaster = require("./broadcaster") as typeof broadcaster
} catch {
  // broadcaster not yet implemented — SSE events will be skipped
}

function safePublish(sessionId: string, event: unknown) {
  try {
    broadcaster?.publish(sessionId, event)
  } catch {
    // ignore publish errors
  }
}

export async function createOrJoinSession(
  displayName: string,
  joinCode: string
): Promise<
  | { status: "created"; session: Session; token: string }
  | { status: "waiting"; session: Session; token: string }
  | { status: "in_progress" }
  | { status: "validation_error"; field: "displayName" | "joinCode"; message: string }
> {
  const validationError = validateMatchmakingInput(displayName, joinCode)
  if (validationError) {
    return { status: "validation_error", ...validationError }
  }

  const normCode = normaliseJoinCode(joinCode)
  const existing = await loadSession(normCode)

  if (!existing) {
    // Create new session
    const hostToken = crypto.randomUUID()
    const now = Date.now()
    const session: Session = {
      joinCode: normCode,
      lobbyState: "waiting",
      host: {
        displayName,
        token: hostToken,
        player: null,
        connectedAt: now,
      },
      joiner: null,
      battleId: null,
      createdAt: now,
      updatedAt: now,
      acceptanceDeadline: null,
    }
    await saveSession(session)
    return { status: "created", session, token: hostToken }
  }

  // Session exists
  const { lobbyState } = existing

  if (lobbyState === "in_progress" || lobbyState === "complete" || lobbyState === "pending_acceptance") {
    return { status: "in_progress" }
  }

  // lobbyState === "waiting" — register joiner
  const joinerToken = crypto.randomUUID()
  const now = Date.now()
  const updated: Session = {
    ...existing,
    lobbyState: "pending_acceptance",
    joiner: {
      displayName,
      token: joinerToken,
      player: null,
      connectedAt: now,
    },
    acceptanceDeadline: now + 30_000,
    updatedAt: now,
  }
  await saveSession(updated)

  // Notify host via SSE
  safePublish(normCode, { type: "session_updated", session: updated })

  return { status: "waiting", session: updated, token: joinerToken }
}

export async function acceptJoiner(
  joinCode: string,
  hostToken: string
): Promise<{ battleId: string } | { error: "NOT_HOST" | "WRONG_PHASE" }> {
  const normCode = normaliseJoinCode(joinCode)
  const session = await loadSession(normCode)
  if (!session) return { error: "WRONG_PHASE" }

  if (session.host.token !== hostToken) {
    return { error: "NOT_HOST" }
  }

  if (session.lobbyState !== "pending_acceptance") {
    return { error: "WRONG_PHASE" }
  }

  const battle = await startBattle()
  const now = Date.now()
  const updated: Session = {
    ...session,
    lobbyState: "in_progress",
    battleId: battle.id,
    host: { ...session.host, player: "p1" },
    joiner: session.joiner ? { ...session.joiner, player: "p2" } : null,
    updatedAt: now,
  }
  await saveSession(updated)

  // Send each player their own assignment
  safePublish(normCode, {
    type: "battle_started",
    battleId: battle.id,
    yourPlayer: "p1",
    token: session.host.token,
  })
  safePublish(normCode, {
    type: "battle_started",
    battleId: battle.id,
    yourPlayer: "p2",
    token: session.joiner!.token,
  })

  return { battleId: battle.id }
}

export async function declineJoiner(
  joinCode: string,
  hostToken: string
): Promise<void> {
  const normCode = normaliseJoinCode(joinCode)
  const session = await loadSession(normCode)
  if (!session || session.host.token !== hostToken) return

  const now = Date.now()
  const updated: Session = {
    ...session,
    lobbyState: "waiting",
    joiner: null,
    acceptanceDeadline: null,
    updatedAt: now,
  }
  await saveSession(updated)

  safePublish(normCode, { type: "session_declined" })
}

export async function cancelJoin(
  joinCode: string,
  joinerToken: string
): Promise<void> {
  const normCode = normaliseJoinCode(joinCode)
  const session = await loadSession(normCode)
  if (!session || session.joiner?.token !== joinerToken) return

  const now = Date.now()
  const updated: Session = {
    ...session,
    lobbyState: "waiting",
    joiner: null,
    acceptanceDeadline: null,
    updatedAt: now,
  }
  await saveSession(updated)
}

export async function getSessionState(
  joinCode: string,
  token: string
): Promise<Session | null> {
  const normCode = normaliseJoinCode(joinCode)
  const session = await loadSession(normCode)
  if (!session) return null

  const isHost = session.host.token === token
  const isJoiner = session.joiner?.token === token
  if (!isHost && !isJoiner) return null

  return session
}

// Public (no token required) — used by JoinPrompt to detect if session is still waiting
export async function checkSessionAvailable(
  joinCode: string
): Promise<"waiting" | "unavailable"> {
  const normCode = normaliseJoinCode(joinCode)
  const session = await loadSession(normCode)
  if (!session || session.lobbyState !== "waiting") return "unavailable"
  return "waiting"
}

export async function disconnectFromSession(
  joinCode: string,
  token: string
): Promise<void> {
  const normCode = normaliseJoinCode(joinCode)
  const session = await loadSession(normCode)
  if (!session) return

  if (session.host.token === token) {
    // Host disconnects — delete session, notify joiner if present
    if (session.joiner) {
      safePublish(normCode, { type: "session_expired" })
    }
    await deleteSession(normCode)
    return
  }

  if (session.joiner?.token === token) {
    // Joiner disconnects
    if (session.lobbyState === "in_progress") {
      // Battle already started — just delete the session so the code is freed
      await deleteSession(normCode)
      return
    }
    // Revert to waiting, notify host
    const now = Date.now()
    const updated: Session = {
      ...session,
      lobbyState: "waiting",
      joiner: null,
      acceptanceDeadline: null,
      updatedAt: now,
    }
    await saveSession(updated)
    safePublish(normCode, { type: "session_updated", session: updated })
  }
}
