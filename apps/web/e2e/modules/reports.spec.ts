/**
 * RPT — Reportes · EVO — Evolución del gimnasio. Casos en docs/TESTING_STRATEGY.md §4.
 *
 * Solo lectura. Los montos pueden cambiar si otro spec confirma transferencias, así que
 * los totales se comparan contra la API en el momento y no contra un número fijo.
 */
import { test, expect, type Page } from '@playwright/test'
import { QA, api, API_URL, authFile, open } from '../support/qa'

const N = QA.gyms.norte
const money = (n: number) => n.toLocaleString('es-CL')
const tab = (page: Page, label: string) => page.locator('main').getByRole('button', { name: label, exact: true })

test.describe('RPT — admin', () => {
  test('RPT-01 reportes cargan con los datos del seed (ingresos, alertas, evolución, analítica)', async ({ page }) => {
    const p = await open(page, '/dashboard/reports')
    await expect(page.getByRole('heading', { name: 'Reportes' })).toBeVisible()

    // Ingresos: tarjetas = /payments/revenue, historial con la membresía pagada de Mara
    await expect(page.getByText('Resumen de ingresos')).toBeVisible()
    const revenue = (await api('admin', 'GET', '/payments/revenue')).data
    expect(revenue.month.total).toBeGreaterThanOrEqual(N.plans.mensual.priceCents)
    const card = (label: string) => page.locator('.card', { has: page.getByText(label, { exact: true }) })
    await expect(card('Este mes')).toContainText(money(revenue.month.total))
    await expect(card('Total histórico')).toContainText(money(revenue.allTime.total))
    const maraRow = page.getByRole('row', { name: new RegExp(N.users.member.name) }).first()
    await expect(maraRow).toContainText(N.plans.mensual.name)
    await expect(maraRow).toContainText(money(N.plans.mensual.priceCents))
    // Solo datos del propio gym
    await expect(page.locator('main')).not.toContainText(QA.gyms.sur.users.member.name)

    // Alertas IA: Mateo Riesgo en riesgo y por vencer
    await tab(page, 'Alertas IA').click()
    await expect(page.getByText(/Alumnos en riesgo de abandono/)).toBeVisible()
    await expect(page.getByText(/Membresías por vencer/)).toBeVisible()
    await expect(page.getByText(N.users.member2.name).first()).toBeVisible()

    // Evolución: RMs del seed (Back Squat 105 kg de Mara)
    await tab(page, 'Evolución').click()
    await expect(page.locator('main').getByRole('button', { name: /Back Squat/ })).toBeVisible()
    await expect(page.locator('main').getByText('Sin datos de evolución aún')).toHaveCount(0)

    // Analítica: KPIs sin error
    await tab(page, 'Analítica').click()
    await expect(page.getByText('Resumen del gimnasio')).toBeVisible()
    await expect(page.getByText('No se pudieron cargar las estadísticas del gimnasio')).toHaveCount(0)
    await expect(page.getByText('Planes activos del gimnasio')).toBeVisible()
    await expect(page.locator('main').getByText(N.plans.mensual.name, { exact: true }).first()).toBeVisible()

    p.expectNoErrors()
  })
})

async function expectEvolutionLoads(page: Page) {
  const p = await open(page, '/dashboard/evolution')
  await expect(page.getByRole('heading', { name: 'Evolución del gimnasio' })).toBeVisible()
  // Otros specs crean alumnos en paralelo: se valida que haya números reales, no el valor exacto
  const kpiValue = async (label: string) => {
    const card = page.locator('.card', { has: page.getByText(label, { exact: true }) }).first()
    await expect(card.locator('p').first()).toHaveText(/^\d[\d.]*$/)
    return Number((await card.locator('p').first().innerText()).replace(/\./g, ''))
  }
  expect(await kpiValue('Total miembros')).toBeGreaterThanOrEqual(Object.values(QA.gyms.norte.users).filter(u => u.role === 'MEMBER').length)
  expect(await kpiValue('Clases totales')).toBeGreaterThan(0)
  expect(await kpiValue('Asistencias')).toBeGreaterThan(0)

  // Récords: Back Squat seleccionado por defecto o al hacer clic, con Mara 105 kg (+5)
  await expect(page.getByText('Sin RMs registrados aún')).toHaveCount(0)
  await page.locator('main').getByRole('button', { name: /Back Squat/ }).click()
  await expect(page.getByRole('heading', { name: 'Back Squat' })).toBeVisible()
  await expect(page.getByText(/registros · máx 105 kg/)).toBeVisible()
  await expect(page.locator('main').getByText(QA.gyms.norte.users.member.name)).toBeVisible()
  await expect(page.locator('main')).not.toContainText(QA.gyms.sur.users.member.name)
  p.expectNoErrors()
}

test.describe('EVO — admin', () => {
  test('EVO-01 evolución carga para ADMIN', async ({ page }) => {
    await expectEvolutionLoads(page)
  })
})

test.describe('EVO — coach', () => {
  test.use({ storageState: authFile('coach') })

  test('EVO-01 evolución carga para COACH', async ({ page }) => {
    await expectEvolutionLoads(page)
    await expect(page).toHaveURL(/\/dashboard\/evolution$/)
  })
})
