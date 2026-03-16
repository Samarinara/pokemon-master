#!/usr/bin/env node

const { execSync } = require("child_process")

function parseChoiceRequest(request) {
  const moves = []
  const switches = []

  if (request.active && Array.isArray(request.active)) {
    const active = request.active[0]
    if (active.moves) {
      moves.push(...active.moves.map((m) => m.move))
    }
  }

  if (request.side && typeof request.side === "object") {
    const side = request.side
    if (side.pokemon) {
      for (const p of side.pokemon) {
        if (!p.condition.includes("fnt")) {
          switches.push(p.ident.split(": ")[1])
        }
      }
    }
  }

  return { moves, switches }
}

function parseActivePokemon(output) {
  const p1Active = { name: null, hp: 100, maxHp: 100, fainted: false }
  const p2Active = { name: null, hp: 100, maxHp: 100, fainted: false }

  const switchRegex = /\|switch\|(p\d)a: ([^|]+)\|([^|]+)\|(\d+)\/(\d+)/g
  let match
  while ((match = switchRegex.exec(output)) !== null) {
    const player = match[1]
    const name = match[2]
    const hp = parseInt(match[4])
    const maxHp = parseInt(match[5])

    if (player === "p1") {
      p1Active.name = name
      p1Active.hp = hp
      p1Active.maxHp = maxHp
      p1Active.fainted = false
    } else if (player === "p2") {
      p2Active.name = name
      p2Active.hp = hp
      p2Active.maxHp = maxHp
      p2Active.fainted = false
    }
  }

  // Track HP updates from damage and healing events
  const hpRegex = /\|(?:-damage|-heal|drag|replace)\|(p\d)a: [^|]+\|(\d+)\/(\d+)/g
  while ((match = hpRegex.exec(output)) !== null) {
    const player = match[1]
    const hp = parseInt(match[2])
    const maxHp = parseInt(match[3])
    if (player === "p1") {
      p1Active.hp = hp
      p1Active.maxHp = maxHp
    } else if (player === "p2") {
      p2Active.hp = hp
      p2Active.maxHp = maxHp
    }
  }

  const faintRegex = /\|faint\|(p\d)a:/g
  while ((match = faintRegex.exec(output)) !== null) {
    const player = match[1]
    if (player === "p1") {
      p1Active.fainted = true
      p1Active.hp = 0
    } else if (player === "p2") {
      p2Active.fainted = true
      p2Active.hp = 0
    }
  }

  return { p1Active, p2Active }
}

function parseBattleLog(output) {
  const log = []
  let winner = null

  const lines = output.split("\n")
  for (const line of lines) {
    if (line.startsWith("|update|")) {
      const inner = line.slice(8)
      const innerLines = inner.split("\n")
      for (const msg of innerLines) {
        if (msg.startsWith("|turn|")) {
          log.push(`Turn ${msg.split("|")[2]}`)
        } else if (msg.startsWith("|move|")) {
          const parts = msg.split("|")
          // |move|p1a: Name|Move Name|...
          const user = parts[2] ? parts[2].replace(/p\da: /, "") : ""
          const moveName = parts[3] || ""
          if (user && moveName) log.push(`${user} used ${moveName}!`)
        } else if (msg.startsWith("|switch|")) {
          const m = msg.match(/\|switch\|p\da: ([^|]+)\|/)
          if (m) log.push(`${m[1]} was sent out!`)
        } else if (msg.startsWith("|faint|")) {
          const m = msg.match(/\|faint\|p\da: (.+)/)
          if (m) log.push(`${m[1]} fainted!`)
        } else if (msg.startsWith("|-damage|")) {
          const m = msg.match(/\|-damage\|p\da: ([^|]+)\|(\d+)\/(\d+)/)
          if (m) {
            const pct = Math.round((parseInt(m[2]) / parseInt(m[3])) * 100)
            log.push(`${m[1]}: ${pct}% HP`)
          }
        } else if (msg.startsWith("|-heal|")) {
          const m = msg.match(/\|-heal\|p\da: ([^|]+)\|(\d+)\/(\d+)/)
          if (m) {
            const pct = Math.round((parseInt(m[2]) / parseInt(m[3])) * 100)
            log.push(`${m[1]} restored HP to ${pct}%`)
          }
        } else if (msg.startsWith("|win|")) {
          winner = msg.slice(5).trim()
          log.push(`Battle Ended! Winner: ${winner}`)
        }
      }
    } else if (line.startsWith("|win|")) {
      winner = line.slice(5).trim()
      log.push(`Battle Ended! Winner: ${winner}`)
    }
  }

  return { log, winner }
}

function parseRequestFromOutput(output, player) {
  // sideupdate lines look like: "sideupdate\np1\n|request|{...}"
  const re = new RegExp(`sideupdate\\r?\\n${player}\\r?\\n\\|request\\|(.+)`)
  const m = re.exec(output)
  if (!m) return null
  try { return JSON.parse(m[1]) } catch { return null }
}

function runBattleCommand(input) {
  const output = execSync(
    `node ./node_modules/pokemon-showdown/pokemon-showdown simulate-battle`,
    {
      input,
      encoding: "utf-8",
      maxBuffer: 10 * 1024 * 1024,
    }
  )
  return output
}

async function startBattle() {
  const input = `>start {"formatid":"gen9randombattle"}
>player p1 {"name":"Player 1"}
>player p2 {"name":"Player 2"}
`

  const output = await runBattleCommand(input)
  const { log, winner } = parseBattleLog(output)
  const { p1Active, p2Active } = parseActivePokemon(output)

  const state = {
    id: `battle-${Date.now()}`,
    status: winner ? "ended" : "p1_turn",
    currentPlayer: "p1",
    p1Active,
    p2Active,
    availableMoves: [],
    availableSwitches: [],
    battleLog: log,
    winner,
    _input: input,
  }

  if (!winner) {
    const request = parseRequestFromOutput(output, "p1")
    if (request) {
      const { moves, switches } = parseChoiceRequest(request)
      state.availableMoves = moves
      state.availableSwitches = switches
    } else {
      state.status = "ended"
    }
  }

  return state
}

async function makeChoice(state, choice) {
  const newInput = `${state._input}\n>${state.currentPlayer} ${choice}\n`
  state._input = newInput

  const output = await runBattleCommand(newInput)
  const { log, winner } = parseBattleLog(output)
  // Parse active pokemon from full cumulative output so HP/names persist across turns
  const { p1Active, p2Active } = parseActivePokemon(output)

  state.p1Active = p1Active
  state.p2Active = p2Active

  const playerName = state.currentPlayer === "p1" ? "Player 1" : "Player 2"
  const choiceLabel = choice.startsWith("move ")
    ? state.availableMoves[parseInt(choice.split(" ")[1]) - 1] || choice
    : choice

  state.battleLog = [...(state.battleLog || []), `${playerName}: ${choiceLabel}`, ...log]

  if (winner) {
    state.status = "ended"
    state.winner = winner
  } else {
    // Determine whose request came back — that's whose turn it is next
    const nextPlayer = state.currentPlayer === "p1" ? "p2" : "p1"
    const nextRequest = parseRequestFromOutput(output, nextPlayer)
    const sameRequest = parseRequestFromOutput(output, state.currentPlayer)

    if (nextRequest) {
      // Other player needs to move
      const { moves, switches } = parseChoiceRequest(nextRequest)
      state.availableMoves = moves
      state.availableSwitches = switches
      state.currentPlayer = nextPlayer
      state.status = nextPlayer === "p1" ? "p1_turn" : "p2_turn"
    } else if (sameRequest) {
      // Same player again (e.g. forced switch after faint)
      const { moves, switches } = parseChoiceRequest(sameRequest)
      state.availableMoves = moves
      state.availableSwitches = switches
      state.status = state.currentPlayer === "p1" ? "p1_turn" : "p2_turn"
    } else {
      state.status = "ended"
    }
  }

  return state
}

module.exports = { parseRequestFromOutput, startBattle, makeChoice }

const args = process.argv.slice(2)
const command = args[0]

function getStateArg() {
  const stateIndex = args.indexOf("--state")
  if (stateIndex !== -1 && args[stateIndex + 1]) {
    try {
      return JSON.parse(args[stateIndex + 1])
    } catch (e) {
      return null
    }
  }
  return null
}

if (command === "start") {
  startBattle().then((state) => {
    console.log(JSON.stringify({ id: state.id, ...state }))
  })
} else if (command === "choice") {
  const [id, choice] = args.slice(1)
  const state = getStateArg()
  if (!state) {
    console.error(JSON.stringify({ error: "Battle state not provided" }))
    process.exit(1)
  }
  makeChoice(state, choice).then((result) => {
    console.log(JSON.stringify(result))
  })
}
