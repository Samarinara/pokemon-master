import { getState, getMatch } from "../../../lib/actions"
import BattleClient from "./BattleClient"

export default async function BattlePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const state = await getState(id)

  if (!state) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-lg text-muted-foreground">Battle not found.</p>
      </div>
    )
  }

  const match = state.phase === "battle_ended" ? await getMatch(state.matchId) : null

  return (
    <main className="min-h-screen">
      <BattleClient initialState={state} initialMatch={match} />
    </main>
  )
}
