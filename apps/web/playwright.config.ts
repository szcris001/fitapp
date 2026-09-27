import { defineConfig, devices } from '@playwright/test'
import { readFileSync } from 'fs'
import { resolve } from 'path'

// Cargar variables de entorno del archivo .env.e2e si existe
try {
  const envPath = resolve(__dirname, '.env.e2e')
  const envContent = readFileSync(envPath, 'utf-8')
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIndex = trimmed.indexOf('=')
    if (eqIndex === -1) continue
    const key = trimmed.slice(0, eqIndex).trim()
    const value = trimmed.slice(eqIndex + 1).trim()
    if (key && !(key in process.env)) {
      process.env[key] = value
    }
  }
} catch {
  // .env.e2e opcional
}

/**
 * Configuración de Playwright para tests E2E del dashboard web de FitHub.
 *
 * Variables de entorno esperadas:
 *  - PLAYWRIGHT_BASE_URL  (default: http://localhost:3000)
 *  - PLAYWRIGHT_API_URL   (default: http://localhost:3001/api)
 *  - E2E_GYM_SLUG         slug del gym de test (default: test-gym-e2e)
 *  - E2E_ADMIN_EMAIL      email del admin de test
 *  - E2E_ADMIN_PASSWORD   contraseña del admin de test
 */
export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.e2e.spec.ts',
  fullyParallel: false,          // tests secuenciales: comparten DB y sesión
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  timeout: 30_000,               // 30s por test
  expect: { timeout: 8_000 },

  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
  ],

  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'off',
    headless: true,
    locale: 'es-CL',
  },

  projects: [
    // ── Paso 1: setup global (login → guarda estado de auth) ──────────────────
    {
      name: 'setup',
      testMatch: /global\.setup\.ts/,
    },
    // ── Paso 2: tests E2E usando auth guardada ─────────────────────────────────
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'playwright/.auth/admin.json',
      },
      dependencies: ['setup'],
    },
  ],

  // Levanta Next.js antes de correr los tests (reutiliza servidor si ya está up)
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:3000',
    reuseExistingServer: true,
    timeout: 60_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
})
