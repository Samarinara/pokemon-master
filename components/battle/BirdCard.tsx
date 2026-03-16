"use client"

import { BirdInstance } from "../../lib/types"

interface BirdCardProps {
  instance: BirdInstance
  isActive?: boolean
}

const COLOUR_STYLES: Record<string, string> = {
  Red: "bg-red-500 text-white",
  Yellow: "bg-yellow-400 text-black",
  Blue: "bg-blue-500 text-white",
  Orange: "bg-orange-500 text-white",
  Purple: "bg-purple-500 text-white",
  Green: "bg-green-500 text-white",
  Pink: "bg-pink-400 text-white",
  Black: "bg-gray-900 text-white",
}

const STATUS_ICONS: Record<string, string> = {
  Bleed: "🩸 Bleed",
  Shaken: "💫 Shaken",
  Bruised: "🟤 Bruised",
}

const STAT_LABELS: Array<{ key: keyof BirdInstance["statStages"]; label: string }> = [
  { key: "str", label: "STR" },
  { key: "guts", label: "GUT" },
  { key: "spd", label: "SPD" },
  { key: "spirit", label: "SPI" },
]

export function BirdCard({ instance, isActive = false }: BirdCardProps) {
  const { bird, currentHp, currentSpirit, statStages, status, fainted } = instance
  const maxHp = bird.baseStats.hp
  const maxSpirit = bird.baseStats.spirit

  const hpPct = Math.max(0, Math.min(100, (currentHp / maxHp) * 100))
  const spiritPct = Math.max(0, Math.min(100, (currentSpirit / maxSpirit) * 100))

  const hpBarColour =
    hpPct > 50 ? "bg-green-500" : hpPct > 25 ? "bg-yellow-400" : "bg-red-500"

  const nonZeroStages = STAT_LABELS.filter(({ key }) => statStages[key] !== 0)

  return (
    <div
      className={`relative rounded-lg border-2 bg-card text-card-foreground p-3 w-48 select-none transition-colors ${
        isActive ? "border-primary shadow-md" : "border-border"
      }`}
    >
      {/* Fainted overlay */}
      {fainted && (
        <div className="absolute inset-0 rounded-lg bg-black/60 flex items-center justify-center z-10">
          <span className="text-white font-bold text-sm tracking-wide">💀 Fainted</span>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-2 gap-1">
        <h3 className="font-bold text-sm truncate">{bird.name}</h3>
        <span
          className={`text-xs px-1.5 py-0.5 rounded-full font-medium shrink-0 ${
            COLOUR_STYLES[bird.colour] ?? "bg-muted text-muted-foreground"
          }`}
        >
          {bird.colour}
        </span>
      </div>

      {/* HP bar */}
      <div className="mb-1">
        <div className="flex justify-between text-xs text-muted-foreground mb-0.5">
          <span>HP</span>
          <span>
            {currentHp}/{maxHp}
          </span>
        </div>
        <div className="h-2.5 w-full rounded-full bg-muted overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${hpBarColour}`}
            style={{ width: `${hpPct}%` }}
          />
        </div>
      </div>

      {/* Spirit meter */}
      <div className="mb-2">
        <div className="flex justify-between text-xs text-muted-foreground mb-0.5">
          <span>Spirit</span>
          <span>
            {currentSpirit}/{maxSpirit}
          </span>
        </div>
        <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
          <div
            className="h-full rounded-full bg-blue-400 transition-all"
            style={{ width: `${spiritPct}%` }}
          />
        </div>
      </div>

      {/* Status condition */}
      {status && (
        <div className="mb-1.5">
          <span className="text-xs px-1.5 py-0.5 rounded bg-destructive/20 text-destructive font-medium">
            {STATUS_ICONS[status] ?? status}
          </span>
        </div>
      )}

      {/* Stat stage badges */}
      {nonZeroStages.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {nonZeroStages.map(({ key, label }) => {
            const stage = statStages[key]
            const positive = stage > 0
            return (
              <span
                key={key}
                className={`text-xs px-1 py-0.5 rounded font-mono font-semibold ${
                  positive
                    ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400"
                    : "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400"
                }`}
              >
                {label} {positive ? "+" : ""}
                {stage}
              </span>
            )
          })}
        </div>
      )}
    </div>
  )
}
