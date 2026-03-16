import { StartBattleButton } from "@/components/StartBattleButton"

export default function Page() {
  return (
    <div className="flex min-h-svh items-center justify-center p-6">
      <div className="flex flex-col items-center gap-4">
        <h1 className="text-2xl font-semibold">Chroma Battle Simulator</h1>
        <StartBattleButton />
      </div>
    </div>
  )
}
