"use client"

import type { ResolvedAction, ReversalWindowState } from "../../lib/types"
import ReversalPrompt from "./ReversalPrompt"

interface TimelineBarProps {
  queue: ResolvedAction[]
  currentIndex: number
  reversalWindow: ReversalWindowState | null
  onReversalDecision?: (accepted: boolean, moveId?: string) => void
}

function orderIcon(type: string): string {
  if (type === "attack") return "⚔️"
  if (type === "block") return "🛡️"
  if (type === "switch") return "🔄"
  return "?"
}

function slotLabel(slot: string): string {
  if (slot === "left") return "L"
  if (slot === "right") return "R"
  return slot
}

export default function TimelineBar({
  queue,
  currentIndex,
  reversalWindow,
  onReversalDecision,
}: TimelineBarProps) {
  return (
    <div className="flex flex-col gap-2 w-full">
      <div className="flex items-center gap-2 overflow-x-auto py-2">
        {queue.map((action, index) => {
          const isActive = index === currentIndex
          return (
            <div
              key={index}
              className={`flex flex-col items-center justify-center min-w-[56px] px-2 py-1 rounded border text-sm font-medium transition-colors ${
                isActive
                  ? "bg-yellow-400 border-yellow-600 text-yellow-900"
                  : "bg-gray-100 border-gray-300 text-gray-700"
              }`}
            >
              <span className="text-xs font-bold">
                {action.player === "p1" ? "P1" : "P2"}-{slotLabel(action.slot)}
              </span>
              <span className="text-base leading-none">{orderIcon(action.order.type)}</span>
            </div>
          )
        })}
        {queue.length === 0 && (
          <span className="text-gray-400 text-sm italic">No actions queued</span>
        )}
      </div>
      {reversalWindow !== null && (
        <ReversalPrompt
          reversalWindow={reversalWindow}
          onDecision={onReversalDecision ?? (() => {})}
        />
      )}
    </div>
  )
}
