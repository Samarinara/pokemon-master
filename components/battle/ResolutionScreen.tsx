"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import type { BattleState, LogEntry } from "../../lib/types"
import { buildSnapshots } from "../../lib/snapshots"
import { BirdCard } from "./BirdCard"
import { ActionAnnouncement } from "./ActionAnnouncement"
import type { BeatPhase } from "./ActionAnnouncement"

// ── Props ─────────────────────────────────────────────────────────────────────

interface ResolutionScreenProps {
  preState: BattleState
  postState: BattleState
  onComplete: () => void
}

// ── AnimState ─────────────────────────────────────────────────────────────────

interface AnimState {
  beatIndex: number
  beatPhase: BeatPhase
  currentSnapshot: BattleState
  visibleLogEntries: LogEntry[]
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getNewLogEntries(
  snapshots: BattleState[],
  beatIndex: number,
  preState: BattleState
): LogEntry[] {
  const current = snapshots[beatIndex]
  const prev = beatIndex === 0 ? preState : snapshots[beatIndex - 1]
  const prevLen = prev.battleLog.length
  return current.battleLog.slice(prevLen)
}

// ── ResolutionScreen ──────────────────────────────────────────────────────────

export function ResolutionScreen({ preState, postState: _postState, onComplete }: ResolutionScreenProps) {
  const snapshots = useMemo(() => buildSnapshots(preState), [preState])

  const [animState, setAnimState] = useState<AnimState>({
    beatIndex: 0,
    beatPhase: "announce",
    currentSnapshot: preState,
    visibleLogEntries: [],
  })

  const logRef = useRef<HTMLDivElement>(null)
  const onCompleteRef = useRef(onComplete)
  onCompleteRef.current = onComplete

  // Call onComplete immediately when there are no snapshots
  useEffect(() => {
    if (snapshots.length === 0) {
      onCompleteRef.current()
    }
  }, [snapshots])

  // Auto-scroll log to bottom when entries change
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight
    }
  }, [animState.visibleLogEntries])

  // Advance to the next beat, appending log entries and handling reversal windows
  const handleNext = () => {
    if (snapshots.length === 0) {
      onComplete()
      return
    }

    setAnimState((prev) => {
      const { beatIndex } = prev
      const currentSnap = snapshots[beatIndex]
      const newEntries = getNewLogEntries(snapshots, beatIndex, preState)
      const updatedLog = [...prev.visibleLogEntries, ...newEntries]

      // If this beat has a reversal window and we haven't shown it yet, pause on it
      if (currentSnap.reversalWindow !== null && prev.beatPhase !== "reversal") {
        return {
          ...prev,
          beatPhase: "reversal",
          currentSnapshot: currentSnap,
          visibleLogEntries: updatedLog,
        }
      }

      const nextIndex = beatIndex + 1
      if (nextIndex >= snapshots.length) {
        onCompleteRef.current()
        return { ...prev, beatPhase: "done", visibleLogEntries: updatedLog }
      }

      return {
        ...prev,
        beatIndex: nextIndex,
        beatPhase: "announce",
        currentSnapshot: currentSnap,
        visibleLogEntries: updatedLog,
      }
    })
  }

  const { beatIndex, beatPhase, currentSnapshot, visibleLogEntries } = animState

  const currentAction = snapshots.length > 0 ? preState.resolutionQueue[beatIndex] : null
  const preSnapshot = snapshots.length > 0 && beatIndex > 0 ? snapshots[beatIndex - 1] : preState
  const postSnapshot = snapshots.length > 0 ? snapshots[beatIndex] : preState

  const showReversalIndicator =
    currentSnapshot.reversalWindow !== null ||
    (beatPhase === "reversal" && snapshots[beatIndex]?.reversalWindow !== null)

  const reversalExpired = beatPhase !== "reversal" && currentSnapshot.reversalWindow === null

  return (
    <div className="flex flex-col min-h-screen bg-background text-foreground p-2 sm:p-4 gap-3">
      {/* Bird panels — two rows */}
      <div className="flex flex-col gap-2">
        {/* P1 team */}
        <div className="flex flex-wrap justify-center gap-2">
          <BirdCard instance={currentSnapshot.p1Field.left} />
          <BirdCard instance={currentSnapshot.p1Field.right} />
          <BirdCard instance={currentSnapshot.p1Field.bench} />
        </div>
        {/* P2 team */}
        <div className="flex flex-wrap justify-center gap-2">
          <BirdCard instance={currentSnapshot.p2Field.left} />
          <BirdCard instance={currentSnapshot.p2Field.right} />
          <BirdCard instance={currentSnapshot.p2Field.bench} />
        </div>
      </div>

      {/* Central announcement area */}
      <div className="flex flex-col items-center gap-2 min-h-[80px] justify-center">
        {currentAction && snapshots.length > 0 && beatPhase !== "done" && (
          <ActionAnnouncement
            action={currentAction}
            preSnapshot={preSnapshot}
            postSnapshot={postSnapshot}
            beatPhase={beatPhase}
          />
        )}

        {/* Reversal window indicator */}
        {showReversalIndicator && (
          <div
            className={`px-3 py-1.5 rounded-lg border text-sm font-semibold transition-colors ${
              reversalExpired
                ? "border-muted text-muted-foreground bg-muted/30"
                : "border-yellow-500 text-yellow-600 bg-yellow-50 dark:bg-yellow-900/20"
            }`}
          >
            {reversalExpired ? "⚡ Reversal window expired" : "⚡ Reversal window open!"}
            {currentSnapshot.reversalWindow && (
              <span className="ml-2 text-xs opacity-75">
                ({currentSnapshot.reversalWindow.defendingPlayer}{" "}
                {currentSnapshot.reversalWindow.defendingSlot})
              </span>
            )}
          </div>
        )}
      </div>

      {/* Log panel */}
      <div
        ref={logRef}
        className="flex-1 overflow-y-auto max-h-40 rounded-lg border bg-muted/30 p-2 text-sm space-y-0.5"
        aria-live="polite"
        aria-label="Battle log"
      >
        {visibleLogEntries.length === 0 && (
          <p className="text-muted-foreground text-xs italic">Waiting…</p>
        )}
        {visibleLogEntries.map((entry, i) => (
          <p key={i} className="text-foreground leading-snug">
            {entry.text}
          </p>
        ))}
      </div>

      {/* Next button */}
      {animState.beatPhase !== "done" && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={handleNext}
            className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 transition-colors"
          >
            {animState.beatIndex >= snapshots.length - 1 && animState.beatPhase !== "reversal"
              ? "Continue"
              : "Next"}
          </button>
        </div>
      )}
    </div>
  )
}
