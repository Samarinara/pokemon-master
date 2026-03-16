"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { createOrJoinSession, checkSessionAvailable } from "@/lib/matchmaking/actions"

type PromptState = "idle" | "accepting" | "unavailable"

const POLL_INTERVAL_MS = 2_000

interface JoinPromptProps {
  hostName: string
  joinCode: string
  displayName: string
  onChangeCode: (displayName: string) => void
}

export default function JoinPrompt({
  hostName,
  joinCode,
  displayName,
  onChangeCode,
}: JoinPromptProps) {
  const router = useRouter()
  const [state, setState] = useState<PromptState>("idle")
  const [error, setError] = useState<string | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Poll to detect if the session transitions away while viewing the prompt
  useEffect(() => {
    pollRef.current = setInterval(async () => {
      const availability = await checkSessionAvailable(joinCode)
      if (availability === "unavailable") {
        clearInterval(pollRef.current!)
        pollRef.current = null
        setState("unavailable")
      }
    }, POLL_INTERVAL_MS)

    return () => {
      if (pollRef.current !== null) {
        clearInterval(pollRef.current)
      }
    }
  }, [joinCode])

  // When session becomes unavailable, auto-return to form after a short delay
  useEffect(() => {
    if (state !== "unavailable") return
    const timer = setTimeout(() => {
      onChangeCode(displayName)
    }, 3_000)
    return () => clearTimeout(timer)
  }, [state, displayName, onChangeCode])

  async function handleAccept() {
    setState("accepting")
    setError(null)
    try {
      const result = await createOrJoinSession(displayName, joinCode)
      if (result.status === "waiting") {
        // Session transitioned to pending_acceptance — navigate to lobby as joiner
        router.push(
          `/lobby/${result.session.joinCode}?token=${result.token}&role=joiner`
        )
      } else if (result.status === "in_progress") {
        setState("unavailable")
      } else if (result.status === "validation_error") {
        setError(result.message)
        setState("idle")
      } else {
        // "created" — unexpected (code was freed and re-created), treat as unavailable
        setState("unavailable")
      }
    } catch {
      setError("Something went wrong. Please try again.")
      setState("idle")
    }
  }

  function handleChangeCode() {
    onChangeCode(displayName)
  }

  if (state === "unavailable") {
    return (
      <div
        className="flex flex-col items-center justify-center gap-4 p-8"
        role="alert"
        aria-live="assertive"
      >
        <p className="text-sm font-medium text-destructive">
          This session is no longer available.
        </p>
        <p className="text-xs text-muted-foreground">
          Returning you to the entry form…
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center justify-center gap-6 p-8">
      <p className="text-center text-base font-medium">
        <span className="font-bold">{hostName}</span> is waiting to start a battle
      </p>

      {error && (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      )}

      <div className="flex gap-3">
        <Button
          onClick={handleAccept}
          disabled={state === "accepting"}
          aria-busy={state === "accepting"}
        >
          {state === "accepting" ? "Joining…" : "Accept"}
        </Button>
        <Button
          variant="outline"
          onClick={handleChangeCode}
          disabled={state === "accepting"}
        >
          Change Code
        </Button>
      </div>
    </div>
  )
}
