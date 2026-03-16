import type { RNG } from "./types"

export function createRng(): RNG {
  return {
    next(): number {
      return Math.random()
    },
    nextInt(max: number): number {
      return Math.floor(Math.random() * max)
    },
  }
}
