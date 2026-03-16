"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { createOrJoinSession } from "@/lib/matchmaking/actions"
import { validateMatchmakingInput } from "@/lib/matchmaking/validation"

interface FormErrors {
  displayName?: string
  joinCode?: string
  general?: string
}

export default function MatchmakingForm() {
  const router = useRouter()
  const [displayName, setDisplayName] = useState("")
  const [joinCode, setJoinCode] = useState("")
  const [errors, setErrors] = useState<FormErrors>({})
  const [loading, setLoading] = useState(false)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    // Client-side validation
    const validationError = validateMatchmakingInput(displayName, joinCode)
    if (validationError) {
      setErrors({ [validationError.field]: validationError.message })
      return
    }

    setErrors({})
    setLoading(true)

    createOrJoinSession(displayName, joinCode)
      .then((result) => {
        if (result.status === "created") {
          router.push(
            `/lobby/${result.session.joinCode}?token=${result.token}&role=host`
          )
        } else if (result.status === "waiting") {
          router.push(
            `/lobby/${result.session.joinCode}?token=${result.token}&role=joiner`
          )
        } else if (result.status === "in_progress") {
          setJoinCode("")
          setErrors({
            general:
              "This code is already in use by an active battle. Please choose a different code.",
          })
          setLoading(false)
        } else if (result.status === "validation_error") {
          setErrors({ [result.field]: result.message })
          setLoading(false)
        }
      })
      .catch(() => {
        setErrors({ general: "Something went wrong. Please try again." })
        setLoading(false)
      })
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <label htmlFor="displayName" className="text-sm font-medium">
          Display Name
        </label>
        <input
          id="displayName"
          type="text"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          maxLength={24}
          disabled={loading}
          aria-invalid={!!errors.displayName}
          aria-describedby={errors.displayName ? "displayName-error" : undefined}
          className="border border-border bg-background px-2 py-1.5 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring/50 disabled:opacity-50 aria-invalid:border-destructive"
          placeholder="Your name (max 24 chars)"
        />
        {errors.displayName && (
          <p id="displayName-error" className="text-xs text-destructive">
            {errors.displayName}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="joinCode" className="text-sm font-medium">
          Join Code
        </label>
        <input
          id="joinCode"
          type="text"
          value={joinCode}
          onChange={(e) => setJoinCode(e.target.value)}
          maxLength={16}
          disabled={loading}
          aria-invalid={!!errors.joinCode}
          aria-describedby={errors.joinCode ? "joinCode-error" : undefined}
          className="border border-border bg-background px-2 py-1.5 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring/50 disabled:opacity-50 aria-invalid:border-destructive"
          placeholder="Alphanumeric code (max 16 chars)"
        />
        {errors.joinCode && (
          <p id="joinCode-error" className="text-xs text-destructive">
            {errors.joinCode}
          </p>
        )}
      </div>

      {errors.general && (
        <p className="text-xs text-destructive">{errors.general}</p>
      )}

      <Button type="submit" disabled={loading}>
        {loading ? "Connecting…" : "Start / Join Battle"}
      </Button>
    </form>
  )
}
