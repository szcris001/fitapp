/**
 * Flow 6: Ver alerta IA de alumno con riesgo de abandono
 *
 * Ruta: /dashboard/alerts
 *
 * La página carga GET /ai/retention-alerts y muestra:
 *   atRisk, expiringSoon, inactive
 * También tiene "Generar insights" que llama GET /ai/insights (Anthropic).
 *
 * Verifica:
 *  - Página carga con heading correcto
 *  - Sección "Insights con IA" visible
 *  - Botón "Generar insights" clickeable sin error JS
 *  - Estado vacío o con alertas: uno de los dos siempre visible
 *  - Navegación desde acceso rápido del dashboard
 */
import { test, expect } from '@playwright/test'
import { AlertsPage } from './pages/AlertsPage'
import { navigateTo } from './helpers/auth'

test.describe('Flow 6 — Alertas IA de retención', () => {
  test('página de alertas carga con el heading correcto', async ({ page }) => {
    const alertsPage = new AlertsPage(page)
    await navigateTo(page, '/dashboard/alerts')
    await alertsPage.waitForLoad()

    await expect(alertsPage.pageHeading).toBeVisible()
  })

  test('sección Insights con IA y botón Generar están presentes', async ({ page }) => {
    const alertsPage = new AlertsPage(page)
    await navigateTo(page, '/dashboard/alerts')
    await alertsPage.waitForLoad()

    await expect(alertsPage.insightsSectionHeading).toBeVisible()
    await expect(alertsPage.generateInsightsButton).toBeVisible()
  })

  test('estado vacío o con alertas: siempre hay contenido visible', async ({ page }) => {
    const alertsPage = new AlertsPage(page)
    await navigateTo(page, '/dashboard/alerts')
    await alertsPage.waitForLoad()

    const hasNoAlerts  = await alertsPage.noAlertsMessage.isVisible()
    const hasAtRisk    = await alertsPage.atRiskSection.isVisible()
    const hasExpiring  = await alertsPage.expiringSoonSection.isVisible()

    // Al menos uno de los tres estados debe ser visible
    expect(hasNoAlerts || hasAtRisk || hasExpiring).toBe(true)
  })

  test('navegar desde dashboard a alertas vía acceso rápido', async ({ page }) => {
    await navigateTo(page, '/dashboard')

    await page.waitForFunction(
      () => !document.body.textContent?.includes('Cargando dashboard'),
      { timeout: 12_000 },
    )

    // El acceso rápido tiene un botón/link "Alertas IA"
    await page.getByRole('button', { name: /alertas ia/i }).click()
    await expect(page).toHaveURL(/\/dashboard\/alerts/, { timeout: 8_000 })
  })

  test('botón Generar insights es clickeable sin error JS', async ({ page }) => {
    const alertsPage = new AlertsPage(page)
    await navigateTo(page, '/dashboard/alerts')
    await alertsPage.waitForLoad()

    const jsErrors: string[] = []
    page.on('pageerror', (err) => jsErrors.push(err.message))

    await alertsPage.generateInsightsButton.click()

    // Esperar a que la petición inicie (el botón cambia a "Analizando...")
    await page.waitForTimeout(1000)

    // No deben haber errores JavaScript (errores HTTP de la API son OK)
    expect(jsErrors).toHaveLength(0)
  })
})
