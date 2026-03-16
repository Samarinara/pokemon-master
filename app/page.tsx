import { StartBattleButton } from "@/components/StartBattleButton"
import MatchmakingForm from "@/components/matchmaking/MatchmakingForm"

export default function Page() {
  return (
    <div className="flex min-h-svh items-center justify-center p-6">
      <div className="flex flex-col items-center gap-10 w-full max-w-sm">
        <h1 className="text-2xl font-semibold">Chroma Battle Simulator</h1>

        <section className="flex flex-col gap-3 w-full">
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
            Play Online
          </h2>
          <MatchmakingForm />
        </section>

        <div className="flex items-center gap-3 w-full">
          <hr className="flex-1 border-border" />
          <span className="text-xs text-muted-foreground">or</span>
          <hr className="flex-1 border-border" />
        </div>

        <section className="flex flex-col gap-3 w-full items-center">
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
            Play Locally
          </h2>
          <StartBattleButton />
        </section>
      </div>
    </div>
  )
}
