/**
 * DASH — Inicio (dashboard del panel)
 * Casos en docs/TESTING_STRATEGY.md §4.
 *
 * Los KPIs dependen de datos que otros specs modifican (pagos, membresías), por eso
 * DASH-01 compara la UI contra /gyms/me/stats y además verifica los mínimos que
 * garantiza el seed (una alumna pagada este mes, un alumno en riesgo).
 */
import { test, expect, type Page } from '@playwright/test'
import { QA, api, authFile, clp, open } from '../support/qa'

const TZ = 'America/Santiago'

/** Hora local (0-23) en la zona del gym */
const localHour = () => Number(new Date().toLocaleString('en-US', { timeZone: TZ, hour: '2-digit', hourCycle: 'h23' }))

/** Valor que muestra una tarjeta KPI de la franja superior, dado su label exacto */
const kpi = (page: Page, label: string) => page.getByText(label, { exact: true }).locator('..')

test.describe('DASH — admin', () => {
  test('DASH-01 KPIs de ingresos del mes y alumnos en riesgo con valores del seed', async ({ page }) => {
    const p = await open(page, '/dashboard')
    const { status, data: stats } = await api('admin', 'GET', '/gyms/me/stats')
    expect(status).toBe(200)

    // Mínimos del seed: Mara pagó $35.000 hace 5 días; Mateo lleva 20 días sin reservar
    const clpRevenue = stats.revenueMonth.find((r: { currency: string }) => r.currency === 'CLP')?.amount ?? 0
    expect(clpRevenue).toBeGreaterThanOrEqual(QA.gyms.norte.plans.mensual.priceCents)
    expect(stats.atRiskMembers).toBeGreaterThanOrEqual(1)

    // La UI muestra exactamente lo que calcula la API, en formato CLP
    await expect(kpi(page, 'Ingresos del mes')).toContainText(clp(clpRevenue))
    await expect(kpi(page, 'En riesgo')).toContainText(String(stats.atRiskMembers))
    await expect(kpi(page, 'Total alumnos')).toContainText(String(stats.members.total))
    await expect(kpi(page, 'Alumnos activos')).toContainText(String(stats.members.active))

    // Mateo Riesgo (vence en 2 días) aparece en «Por vencer»
    const porVencer = page.locator('.card').filter({ has: page.getByRole('heading', { name: 'Por vencer' }) })
    await expect(porVencer.getByText(QA.gyms.norte.users.member2.name)).toBeVisible()
    await expect(porVencer.getByText(QA.gyms.norte.plans.mensual.name).first()).toBeVisible()
    p.expectNoErrors()
  })

  // BUG: la vista ADMIN del dashboard no tiene tarjeta «WOD del día» (solo existe en la vista COACH,
  // apps/web/app/dashboard/page.tsx ~L577); el admin tampoco pide /wods al cargar.
  test('DASH-02 tarjeta «WOD del día» muestra «QA WOD Hoy»', async ({ page }) => {
    const p = await open(page, '/dashboard')
    const card = page.locator('.card').filter({ hasText: /WOD del día/i })
    await expect(card).toBeVisible()
    await expect(card).toContainText('QA WOD Hoy')
    await expect(card).not.toContainText('QA WOD Mañana')
    p.expectNoErrors()
  })

  // BUG: «Próximas clases» pide /classes?from=<hoy UTC>&to=<hoy UTC> (page.tsx ~L445) y la API
  // interpreta el rango en UTC (classes.service.ts listClasses, setUTCHours(23,59,59)). En Chile
  // (UTC-3/-4) la clase de las 21:00 local cae al día UTC siguiente y nunca aparece; además entra la
  // de las 21:00 de ayer en el contador.
  test('DASH-05 «Próximas clases» incluye la clase de hoy a las 21:00 (hora local)', async ({ page }) => {
    test.skip(localHour() >= 22, 'después de las 22:00 la clase de las 21:00 ya terminó')
    const p = await open(page, '/dashboard')
    const card = page.locator('.card').filter({ has: page.getByRole('heading', { name: 'Próximas clases' }) })
    await expect(card).toBeVisible()
    const more = card.getByRole('button', { name: /clases? más/ })
    if (await more.isVisible()) await more.click()
    // es-CL en Chromium formatea «09:00 p. m.»; se acepta también «21:00»
    await expect(card.getByText(/^(21:00|09:00\s*p\.\s*m\.)$/)).toBeVisible()
    p.expectNoErrors()
  })
})

test.describe('DASH — coach', () => {
  test.use({ storageState: authFile('coach') })

  test('DASH-04 el coach ve «WOD del día» con «QA WOD Hoy»', async ({ page }) => {
    const p = await open(page, '/dashboard')
    const card = page.locator('.card').filter({ hasText: /WOD del día/i })
    await expect(card).toContainText('QA WOD Hoy')
    await expect(card.getByRole('button', { name: 'Gestionar WODs' })).toBeVisible()
    p.expectNoErrors()
  })
})
