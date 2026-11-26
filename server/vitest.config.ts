import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Database tests boot a real Postgres (PGlite, WebAssembly) in their setup hooks: about 7 s on a quiet machine,
    // much longer on a loaded CI runner or one short of memory.
    hookTimeout: 60_000,
    coverage: {
      provider: "v8",
      // A quality gate: at least 90% of the lines in the game engine must be exercised by tests.
      include: ["src/game/**"],
      reporter: ["text"],
      thresholds: { lines: 90 },
    },
  },
});
