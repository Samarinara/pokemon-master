import { redirect } from "next/navigation"
import { getSessionState } from "@/lib/matchmaking/actions"
import LobbyClient from "./LobbyClient"

interface LobbyPageProps {
  params: Promise<{ code: string }>
  searchParams: Promise<{ token?: string; role?: string }>
}

export default async function LobbyPage({ params, searchParams }: LobbyPageProps) {
  const { code } = await params
  const { token, role } = await searchParams

  if (!token) {
    redirect("/")
  }

  const session = await getSessionState(code, token)

  if (!session) {
    redirect("/")
  }

  if (session.lobbyState === "in_progress" && session.battleId) {
    const playerAssigned = session.host.token === token ? "p1" : "p2"
    redirect(`/battle/${session.battleId}?token=${encodeURIComponent(token)}&player=${playerAssigned}`)
  }

  const resolvedRole = role === "joiner" ? "joiner" : "host"

  return (
    <main className="flex min-h-screen items-center justify-center">
      <LobbyClient session={session} token={token} role={resolvedRole} />
    </main>
  )
}
