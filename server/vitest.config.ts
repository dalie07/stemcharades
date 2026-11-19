import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      // A quality gate: at least 90% of the lines in the game engine must be exercised by tests.
      include: ["src/game/**"],
      reporter: ["text"],
      thresholds: { lines: 90 },
    },
  },
});
