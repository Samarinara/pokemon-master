import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    environment: "node",
    exclude: ["scripts/sim.test.js", "**/node_modules/**"],
  },
})
