import { defineConfig, devices } from "@playwright/test";

/**
 * Los end-to-end del flujo principal.
 *
 * Levantan la aplicación de verdad —backend, frontend y Postgres— y la operan
 * como la opera una persona. Son caros y lentos comparados con los tests de
 * integración, así que hay pocos y cubren el camino que, si se rompe, deja al
 * sistema sin razón de ser: vender, cobrar, y que el saldo lo refleje.
 *
 * No reemplazan a nada: las reglas se prueban en `@erp/core`, el acceso a
 * datos en los tests de servicios contra Postgres. Esto prueba que las piezas
 * están conectadas.
 */

const CI = !!process.env.CI;

/**
 * Con qué navegador corre.
 *
 * Por defecto, el Chromium que Playwright descarga, que es lo que usa el CI.
 * `E2E_CANAL=chrome` usa el Chrome ya instalado en la máquina: sirve cuando
 * esa descarga no es viable —detrás de un proxy, con poca conexión— y permite
 * correr los e2e sin bajar 130 MB.
 */
const CANAL = process.env.E2E_CANAL;

export default defineConfig({
  testDir: "./tests",
  // En serie: comparten una base y un usuario. Paralelizarlos pide aislarlos
  // por organización, que es trabajo que todavía no vale la pena.
  workers: 1,
  fullyParallel: false,
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  reporter: CI ? [["github"], ["list"]] : [["list"]],
  timeout: 60_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL: process.env.E2E_URL ?? "http://localhost:5173",
    locale: "es-AR",
    timezoneId: "America/Argentina/Buenos_Aires",
    // Pedido explícito: sin trazas. Pesan y acá no se usan.
    trace: "off",
    video: "off",
    screenshot: "only-on-failure",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], ...(CANAL ? { channel: CANAL } : {}) },
    },
  ],

  // En local se reusa lo que ya esté levantado; en CI siempre arranca limpio.
  webServer: [
    {
      command: "pnpm --filter @erp/backend dev",
      url: "http://localhost:3001/health",
      reuseExistingServer: !CI,
      timeout: 120_000,
      stdout: "pipe",
      stderr: "pipe",
    },
    {
      command: "pnpm --filter @erp/frontend dev",
      url: "http://localhost:5173",
      reuseExistingServer: !CI,
      timeout: 120_000,
      stdout: "pipe",
      stderr: "pipe",
    },
  ],
});
