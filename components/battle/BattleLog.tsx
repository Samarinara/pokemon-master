"use client"

import { useEffect, useRef } from "react"
import { LogEntry } from "../../lib/types"

interface BattleLogProps {
  entries: LogEntry[]
}

export default function BattleLog({ entries }: BattleLogProps) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [entries])

  return (
    <div className="max-h-64 overflow-y-auto rounded border border-gray-200 bg-gray-50 p-2 text-sm">
      {entries.map((entry, i) => (
        <div key={i} className="py-0.5">
          <span className="font-medium text-gray-500">T{entry.turn}:</span>{" "}
          <span>{entry.text}</span>
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  )
}
