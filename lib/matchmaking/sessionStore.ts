import { getDb, saveDb } from "../store"
import type { Session } from "./types"

export async function saveSession(session: Session): Promise<void> {
  const db = await getDb()
  db.run(
    `INSERT INTO sessions (
       join_code, lobby_state, host_name, host_token,
       joiner_name, joiner_token, battle_id,
       acceptance_deadline, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(join_code) DO UPDATE SET
       lobby_state         = excluded.lobby_state,
       host_name           = excluded.host_name,
       host_token          = excluded.host_token,
       joiner_name         = excluded.joiner_name,
       joiner_token        = excluded.joiner_token,
       battle_id           = excluded.battle_id,
       acceptance_deadline = excluded.acceptance_deadline,
       updated_at          = excluded.updated_at`,
    [
      session.joinCode.toUpperCase(),
      session.lobbyState,
      session.host.displayName,
      session.host.token,
      session.joiner?.displayName ?? null,
      session.joiner?.token ?? null,
      session.battleId ?? null,
      session.acceptanceDeadline ?? null,
      session.createdAt,
      session.updatedAt,
    ]
  )
  saveDb()
}

export async function loadSession(joinCode: string): Promise<Session | null> {
  const db = await getDb()
  const stmt = db.prepare(
    `SELECT join_code, lobby_state, host_name, host_token,
            joiner_name, joiner_token, battle_id,
            acceptance_deadline, created_at, updated_at
     FROM sessions WHERE join_code = ?`
  )
  stmt.bind([joinCode.toUpperCase()])
  if (stmt.step()) {
    const row = stmt.get()
    stmt.free()
    const [
      join_code,
      lobby_state,
      host_name,
      host_token,
      joiner_name,
      joiner_token,
      battle_id,
      acceptance_deadline,
      created_at,
      updated_at,
    ] = row as [
      string,
      string,
      string,
      string,
      string | null,
      string | null,
      string | null,
      number | null,
      number,
      number,
    ]

    const session: Session = {
      joinCode: join_code,
      lobbyState: lobby_state as Session["lobbyState"],
      host: {
        displayName: host_name,
        token: host_token,
        player: null,
        connectedAt: 0,
      },
      joiner:
        joiner_name && joiner_token
          ? {
              displayName: joiner_name,
              token: joiner_token,
              player: null,
              connectedAt: 0,
            }
          : null,
      battleId: battle_id ?? null,
      acceptanceDeadline: acceptance_deadline ?? null,
      createdAt: created_at,
      updatedAt: updated_at,
    }
    return session
  }
  stmt.free()
  return null
}

export async function loadSessionByBattleId(battleId: string): Promise<Session | null> {
  const db = await getDb()
  const stmt = db.prepare(
    `SELECT join_code, lobby_state, host_name, host_token,
            joiner_name, joiner_token, battle_id,
            acceptance_deadline, created_at, updated_at
     FROM sessions WHERE battle_id = ?`
  )
  stmt.bind([battleId])
  if (stmt.step()) {
    const row = stmt.get()
    stmt.free()
    const [
      join_code,
      lobby_state,
      host_name,
      host_token,
      joiner_name,
      joiner_token,
      battle_id,
      acceptance_deadline,
      created_at,
      updated_at,
    ] = row as [
      string,
      string,
      string,
      string,
      string | null,
      string | null,
      string | null,
      number | null,
      number,
      number,
    ]

    const session: Session = {
      joinCode: join_code,
      lobbyState: lobby_state as Session["lobbyState"],
      host: {
        displayName: host_name,
        token: host_token,
        player: null,
        connectedAt: 0,
      },
      joiner:
        joiner_name && joiner_token
          ? {
              displayName: joiner_name,
              token: joiner_token,
              player: null,
              connectedAt: 0,
            }
          : null,
      battleId: battle_id ?? null,
      acceptanceDeadline: acceptance_deadline ?? null,
      createdAt: created_at,
      updatedAt: updated_at,
    }
    return session
  }
  stmt.free()
  return null
}

export async function deleteSession(joinCode: string): Promise<void> {
  const db = await getDb()
  db.run("DELETE FROM sessions WHERE join_code = ?", [joinCode.toUpperCase()])
  saveDb()
}

export async function expireStaleWaitingSessions(olderThanMs: number): Promise<void> {
  const db = await getDb()
  const cutoff = Date.now() - olderThanMs
  db.run(
    "DELETE FROM sessions WHERE lobby_state = 'waiting' AND created_at < ?",
    [cutoff]
  )
}
