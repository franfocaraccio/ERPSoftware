import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    // En un monorepo con pnpm, cada package puede resolver su propia copia de
    // React y los hooks fallan ("Invalid hook call"). Esto fuerza una sola.
    dedupe: ["react", "react-dom"],
  },
  server: {
    port: 5173,
  },
  test: {
    coverage: {
      provider: "v8",
      reporter: ["text-summary", "json-summary", "lcov"],
      include: ["src/**/*.ts", "src/**/*.tsx"],
      exclude: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    },
  },
});
