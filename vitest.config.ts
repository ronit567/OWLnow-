import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/*/src/**/*.test.ts", "apps/*/src/**/*.test.ts"],
    // Keeps `npm test` green until the first tests land.
    passWithNoTests: true,
  },
});
