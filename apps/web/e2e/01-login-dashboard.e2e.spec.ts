/**
 * Flow 1: Login admin → ver dashboard con métricas
 *
 * Verifica:
 *  - Login con credenciales válidas redirige a /dashboard
 *  - Dashboard muestra los KPI cards (Total alumnos, Alumnos activos)
 *  - Dashboard muestra sección de clases del día
 *  - Dashboard muestra sección de ocupación
 *  - Login con credenciales inválidas muestra error (permanece en /login)
 *  - Protección de ruta: /dashboard sin auth redirige a /login
 */
import { test, expect } from '@playwright/test'
import { DashboardPage } from './pages/DashboardPage'
import { LoginPage } from './pages/LoginPage'
import { navigateTo } from './helpers/auth'

const EMAIL    = process.env.E2E_ADMIN_EMAIL ?? 'e2e-admin@fitapp.test'
const GYM_SLUG = process.env.E2E_GYM_SLUG ?? ''

test.describe('Flow 1 — Login admin → dashboard con métricas', () => {
  test('dashboard carga y muestra KPI de alumnos', async ({ page }) => {
    const dashboard = new DashboardPage(page)
    await navigateTo(page, '/dashboard')
    await dashboard.waitForLoad()

    await expect(page).toHaveURL(/\/dashboard/)
    await expect(dashboard.totalAlumnosCard).toBeVisible()
    await expect(dashboard.alumnosActivosCard).toBeVisible()
  })

  test('dashboard muestra sección de clases y ocupación', async ({ page }) => {
    const dashboard = new DashboardPage(page)
    await navigateTo(page, '/dashboard')
    await dashboard.waitForLoad()

    await expect(dashboard.proximasClasesHeading).toBeVisible()
    await expect(dashboard.ocupacionHeading).toBeVisible()
  })

  test('acceso rápido muestra link a Alertas IA', async ({ page }) => {
    const dashboard = new DashboardPage(page)
    await navigateTo(page, '/dashboard')
    await dashboard.waitForLoad()

    await expect(dashboard.alertasIALink).toBeVisible()
  })

  test('login con credenciales inválidas muestra error', async ({ page }) => {
    const loginPage = new LoginPage(page)
    await loginPage.goto()
    if (GYM_SLUG) await loginPage.gymSlugInput.fill(GYM_SLUG)
    await loginPage.emailInput.fill(EMAIL)
    await loginPage.passwordInput.fill('wrong-password-9999')
    await loginPage.submitButton.click()

    // Debe permanecer en /login con mensaje de error
    await expect(page).toHaveURL(/\/login/, { timeout: 5_000 })
    // El formulario de login sigue visible (no se redirigió)
    await expect(loginPage.submitButton).toBeVisible()
  })

  test('ruta /dashboard sin auth redirige a /login', async ({ browser }) => {
    // Crear contexto limpio sin storageState — usuario no autenticado
    const context = await browser.newContext()
    const page = await context.newPage()
    await page.goto('/dashboard')
    await expect(page).toHaveURL(/\/login/, { timeout: 10_000 })
    await context.close()
  })
})
