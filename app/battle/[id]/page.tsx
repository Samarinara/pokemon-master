import { getState, getMatch } from "../../../lib/actions"
import BattleClient from "./BattleClient"
import type { Player } from "../../../lib/types"

export default async function BattlePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ token?: string; player?: string }>
}) {
  const { id } = await params
  const { token, player } = await searchParams

  const state = await getState(id)

  if (!state) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-lg text-muted-foreground">Battle not found.</p>
      </div>
    )
  }

  const match = state.phase === "battle_ended" ? await getMatch(state.matchId) : null

  const sessionToken = token ?? undefined
  const myPlayer: Player | undefined =
    player === "p1" || player === "p2" ? player : undefined

  return (
    <main className="min-h-screen">
      <BattleClient
        initialState={state}
        initialMatch={match}
        sessionToken={sessionToken}
        myPlayer={myPlayer}
      />
    </main>
  )
}
