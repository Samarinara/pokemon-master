"use client"

import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { startBattle } from "@/lib/actions"

export function StartBattleButton() {
  const router = useRouter()

  async function handleClick() {
    const state = await startBattle()
    router.push(`/battle/${state.id}`)
  }

  return <Button onClick={handleClick}>Start Battle</Button>
}
