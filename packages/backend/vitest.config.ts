import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    setupFiles: ["./src/test/setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text-summary", "json-summary", "lcov"],
      include: ["src/**/*.ts"],
      // Los index.ts sólo reexportan, y los scripts no son código de negocio.
      exclude: ["src/**/*.test.ts", "src/**/index.ts", "src/scripts/**", "src/test/**"],
    },
  },
});
