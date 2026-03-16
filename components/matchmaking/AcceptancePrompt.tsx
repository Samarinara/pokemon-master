"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { acceptJoiner, declineJoiner } from "@/lib/matchmaking/actions"
import { Button } from "@/components/ui/button"

const COUNTDOWN_SECONDS = 30

interface AcceptancePromptProps {
  joinerName: string
  joinCode: string
  hostToken: string
  onDeclined: () => void
}

export default function AcceptancePrompt({
  joinerName,
  joinCode,
  hostToken,
  onDeclined,
}: AcceptancePromptProps) {
  const router = useRouter()
  const [secondsLeft, setSecondsLeft] = useState(COUNTDOWN_SECONDS)
  const [acceptLoading, setAcceptLoading] = useState(false)
  const [declineLoading, setDeclineLoading] = useState(false)
  const handledRef = useRef(false)

  // Countdown timer — auto-declines when it reaches 0
  useEffect(() => {
    if (secondsLeft <= 0) {
      if (handledRef.current) return
      handledRef.current = true
      setDeclineLoading(true)
      declineJoiner(joinCode, hostToken).then(() => {
        onDeclined()
      })
      return
    }

    const id = setTimeout(() => setSecondsLeft((s) => s - 1), 1_000)
    return () => clearTimeout(id)
  }, [secondsLeft, joinCode, hostToken, onDeclined])

  async function handleAccept() {
    if (handledRef.current) return
    handledRef.current = true
    setAcceptLoading(true)
    const result = await acceptJoiner(joinCode, hostToken)
    if ("battleId" in result) {
      router.push(`/battle/${result.battleId}?token=${encodeURIComponent(hostToken)}&player=p1`)
    } else {
      // Unexpected error — treat as decline
      setAcceptLoading(false)
      handledRef.current = false
    }
  }

  async function handleDecline() {
    if (handledRef.current) return
    handledRef.current = true
    setDeclineLoading(true)
    await declineJoiner(joinCode, hostToken)
    onDeclined()
  }

  const isLoading = acceptLoading || declineLoading

  return (
    <div className="flex flex-col items-center justify-center gap-6 p-8">
      <h1 className="text-xl font-semibold">Opponent Found</h1>

      <p className="text-center text-sm text-muted-foreground">
        <span className="font-semibold text-foreground">{joinerName}</span> wants to battle you.
      </p>

      {/* Countdown */}
      <div
        className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-foreground/20 text-2xl font-bold tabular-nums"
        role="timer"
        aria-label={`${secondsLeft} seconds remaining`}
        aria-live="polite"
      >
        {secondsLeft}
      </div>

      <p className="text-xs text-muted-foreground">
        Auto-declining in {secondsLeft}s
      </p>

      <div className="flex gap-4">
        <Button
          onClick={handleAccept}
          disabled={isLoading}
          aria-busy={acceptLoading}
        >
          {acceptLoading ? "Accepting…" : "Accept"}
        </Button>

        <Button
          variant="outline"
          onClick={handleDecline}
          disabled={isLoading}
          aria-busy={declineLoading}
        >
          {declineLoading ? "Declining…" : "Decline"}
        </Button>
      </div>
    </div>
  )
}
