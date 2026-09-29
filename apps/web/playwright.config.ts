import { defineConfig, devices } from '@playwright/test'

/**
 * Suite E2E del panel web (capa 1 de docs/TESTING_STRATEGY.md).
 *
 * - Proyecto "setup" (e2e/auth.setup.ts): corre `pnpm seed:qa` y guarda una sesión por
 *   rol en playwright/.auth/<rol>.json.
 * - Proyecto "chromium": los specs de e2e/modules. Por defecto entran como el ADMIN de
 *   qa-box-norte; un spec cambia de rol con `test.use({ storageState: authFile('coach') })`.
 * - Cada test lleva el ID de caso de la estrategia (p. ej. "PAY-02 …"): `pnpm e2e --grep PAY-`.
 *
 * Requiere la API en :3001 (con la base migrada) y levanta la web si no está corriendo.
 * Variables: PLAYWRIGHT_BASE_URL, PLAYWRIGHT_API_URL, E2E_SKIP_SEED=1.
 */
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000'

export default defineConfig({
  testDir: './e2e',
  // Los specs comparten el entorno QA y algunos lo modifican: van en serie
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 45_000,
  expect: { timeout: 10_000 },

  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['json', { outputFile: 'playwright-report/results.json' }],
  ],

  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
    headless: true,
    locale: 'es-CL',
    timezoneId: 'America/Santiago',
  },

  projects: [
    {
      name: 'setup',
      testMatch: /auth\.setup\.ts/,
    },
    {
      name: 'chromium',
      testMatch: /modules\/.*\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'playwright/.auth/admin.json',
      },
      dependencies: ['setup'],
    },
  ],

  webServer: {
    command: 'pnpm dev',
    url: `${BASE_URL}/login`,
    reuseExistingServer: true,
    timeout: 120_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
})
