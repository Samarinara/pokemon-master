import initSqlJs, { Database } from "sql.js"
import path from "path"
import fs from "fs"
import type { BattleState, OrderSet, MatchState, Player } from "./types"

const DB_PATH = path.join(process.cwd(), "data", "battles.db")

let db: Database | null = null

async function initDb(): Promise<Database> {
  if (db) return db

  const SQL = await initSqlJs({
    locateFile: (file: string) =>
      path.join(process.cwd(), "node_modules", "sql.js", "dist", file),
  })

  const dir = path.dirname(DB_PATH)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }

  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH)
    db = new SQL.Database(buffer)
  } else {
    db = new SQL.Database()
  }

  // Create tables if they don't exist
  db.run(`
    CREATE TABLE IF NOT EXISTS matches (
      id         TEXT PRIMARY KEY,
      p1_wins    INTEGER NOT NULL DEFAULT 0,
      p2_wins    INTEGER NOT NULL DEFAULT 0,
      winner     TEXT,
      complete   INTEGER NOT NULL DEFAULT 0,
      battles    TEXT NOT NULL DEFAULT '[]',
      created_at INTEGER DEFAULT (strftime('%s', 'now'))
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS battles (
      id         TEXT PRIMARY KEY,
      match_id   TEXT,
      state      TEXT NOT NULL,
      created_at INTEGER DEFAULT (strftime('%s', 'now'))
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS pending_orders (
      battle_id TEXT NOT NULL,
      player    TEXT NOT NULL CHECK(player IN ('p1','p2')),
      orders    TEXT NOT NULL,
      PRIMARY KEY (battle_id, player)
    )
  `)

  // Migrate: add match_id column to battles if missing
  try {
    db.run("ALTER TABLE battles ADD COLUMN match_id TEXT")
  } catch {
    // Column already exists, ignore
  }

  return db
}

export function saveDb(): void {
  if (!db) return
  const data = db.export()
  const buffer = Buffer.from(data)
  fs.writeFileSync(DB_PATH, buffer)
}

export async function saveBattle(state: BattleState): Promise<void> {
  const d = await initDb()
  const json = JSON.stringify(state)
  d.run(
    `INSERT INTO battles (id, match_id, state, created_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET match_id = excluded.match_id, state = excluded.state`,
    [state.id, state.matchId ?? null, json, state.createdAt ?? Math.floor(Date.now() / 1000)]
  )
}

export async function loadBattle(id: string): Promise<BattleState | null> {
  const d = await initDb()
  const stmt = d.prepare("SELECT state FROM battles WHERE id = ?")
  stmt.bind([id])
  if (stmt.step()) {
    const row = stmt.get()
    stmt.free()
    return JSON.parse(row[0] as string) as BattleState
  }
  stmt.free()
  return null
}

export async function deleteBattle(id: string): Promise<void> {
  const d = await initDb()
  d.run("DELETE FROM pending_orders WHERE battle_id = ?", [id])
  d.run("DELETE FROM battles WHERE id = ?", [id])
}

export async function savePendingOrders(
  battleId: string,
  player: Player,
  orders: OrderSet
): Promise<void> {
  const d = await initDb()
  const json = JSON.stringify(orders)
  d.run(
    `INSERT INTO pending_orders (battle_id, player, orders)
     VALUES (?, ?, ?)
     ON CONFLICT(battle_id, player) DO UPDATE SET orders = excluded.orders`,
    [battleId, player, json]
  )
}

export async function loadPendingOrders(
  battleId: string
): Promise<{ p1?: OrderSet; p2?: OrderSet }> {
  const d = await initDb()
  const stmt = d.prepare(
    "SELECT player, orders FROM pending_orders WHERE battle_id = ?"
  )
  stmt.bind([battleId])
  const result: { p1?: OrderSet; p2?: OrderSet } = {}
  while (stmt.step()) {
    const row = stmt.get()
    const player = row[0] as Player
    const orders = JSON.parse(row[1] as string) as OrderSet
    result[player] = orders
  }
  stmt.free()
  return result
}

export async function saveMatch(match: MatchState): Promise<void> {
  const d = await initDb()
  d.run(
    `INSERT INTO matches (id, p1_wins, p2_wins, winner, complete, battles, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       p1_wins  = excluded.p1_wins,
       p2_wins  = excluded.p2_wins,
       winner   = excluded.winner,
       complete = excluded.complete,
       battles  = excluded.battles`,
    [
      match.id,
      match.p1Wins,
      match.p2Wins,
      match.winner ?? null,
      match.complete ? 1 : 0,
      JSON.stringify(match.battles),
      Math.floor(Date.now() / 1000),
    ]
  )
}

export async function clearPendingOrders(battleId: string): Promise<void> {
  const d = await initDb()
  d.run("DELETE FROM pending_orders WHERE battle_id = ?", [battleId])
}

export async function loadMatch(id: string): Promise<MatchState | null> {
  const d = await initDb()
  const stmt = d.prepare(
    "SELECT id, p1_wins, p2_wins, winner, complete, battles FROM matches WHERE id = ?"
  )
  stmt.bind([id])
  if (stmt.step()) {
    const row = stmt.get()
    stmt.free()
    return {
      id: row[0] as string,
      p1Wins: row[1] as number,
      p2Wins: row[2] as number,
      winner: (row[3] as Player | null) ?? null,
      complete: (row[4] as number) === 1,
      battles: JSON.parse(row[5] as string) as string[],
    }
  }
  stmt.free()
  return null
}
