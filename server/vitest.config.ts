import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      // The blueprint's quality metric: at least 90% of the lines in server/src/game are exercised by tests.
      include: ["src/game/**"],
      reporter: ["text"],
      thresholds: { lines: 90 },
    },
  },
});
