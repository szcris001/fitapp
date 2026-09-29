/**
 * IA — Alertas de retención
 * Casos en docs/TESTING_STRATEGY.md §4. IA-02 (proyección con Claude) queda fuera: depende
 * de ANTHROPIC_API_KEY.
 *
 * Seed: Mateo Riesgo tiene plan activo, sin reservas hace 20 días y vence en 2 días.
 * Mara Miembro tiene plan activo y reservas recientes (no debe aparecer en riesgo).
 */
import { test, expect } from '@playwright/test'
import { QA, api, open, type Role } from '../support/qa'

const NORTE = QA.gyms.norte
const MATEO = NORTE.users.member2
const MARA = NORTE.users.member
const MENSUAL = NORTE.plans.mensual

test.describe('IA — alertas de retención', () => {
  test('IA-01 las alertas de retención incluyen a Mateo Riesgo', async ({ page }) => {
    const { status, data: alerts } = await api('admin', 'GET', '/ai/retention-alerts')
    expect(status).toBe(200)
    const mateoRisk = alerts.atRisk.find((a: any) => a.email === MATEO.email)
    const mateoExp = alerts.expiringSoon.find((a: any) => a.email === MATEO.email)
    expect(mateoRisk, 'Mateo en atRisk').toBeTruthy()
    expect(mateoExp, 'Mateo en expiringSoon').toBeTruthy()
    expect(mateoExp.daysLeft).toBeGreaterThanOrEqual(1)
    expect(mateoExp.daysLeft).toBeLessThanOrEqual(2)
    expect(alerts.atRisk.map((a: any) => a.email)).not.toContain(MARA.email)

    const p = await open(page, '/dashboard/alerts')
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Retención')

    // Sección "en riesgo": el contador coincide con la API y Mateo aparece con su alerta
    const riskSection = page.locator('section').filter({ has: page.getByRole('heading', { name: /Alumnos en riesgo de abandono/ }) })
    await expect(riskSection.getByRole('heading')).toContainText(`— ${alerts.atRisk.length}`)
    const riskCard = riskSection.locator('div.card').filter({ hasText: MATEO.email })
    await expect(riskCard).toContainText(MATEO.name)
    await expect(riskCard).toContainText(/Sin reservas/)
    await expect(riskSection).not.toContainText(MARA.email)

    // Sección "por vencer": Mateo con su plan y los días que le quedan
    const expSection = page.locator('section').filter({ has: page.getByRole('heading', { name: /Membresías por vencer/ }) })
    await expect(expSection.getByRole('heading')).toContainText(`— ${alerts.expiringSoon.length}`)
    const expCard = expSection.locator('div.card').filter({ hasText: MATEO.name })
    await expect(expCard).toContainText(`${MENSUAL.name} — vence en ${mateoExp.daysLeft} días`)

    // "Ver alumno" lleva al detalle de Mateo
    await riskCard.getByRole('button', { name: 'Ver alumno' }).click()
    await expect(page.getByRole('button', { name: 'Registrar pago' })).toBeVisible()
    await expect(page.getByText(MATEO.email).first()).toBeVisible()
    // El detalle vuelve a la lista si falla la carga: la URL se comprueba al final
    await expect(page).toHaveURL(new RegExp(`/dashboard/users/${mateoRisk.id}$`))
    p.expectNoErrors()
  })

  test('IA-04 las alertas de otro gym no incluyen alumnos de Norte', async () => {
    const { status, data } = await api('adminSur', 'GET', '/ai/retention-alerts')
    expect(status).toBe(200)
    const norteEmails = Object.values(NORTE.users).map(u => u.email)
    const listed = [...data.atRisk, ...data.expiringSoon, ...data.inactive].map((a: any) => a.email)
    for (const email of listed) expect(norteEmails, email).not.toContain(email)
  })
})
