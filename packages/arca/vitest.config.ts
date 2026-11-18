import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      reporter: ["text-summary", "json-summary", "lcov"],
      include: ["src/**/*.ts"],
      // Los index.ts sólo reexportan: contarlos infla la cobertura sin medir nada.
      exclude: ["src/**/*.test.ts", "src/**/index.ts"],
    },
  },
});
