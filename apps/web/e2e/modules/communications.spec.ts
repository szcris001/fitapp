/**
 * COM — Comunicaciones
 * Casos en docs/TESTING_STRATEGY.md §4.
 *
 * No hay SMTP real en QA: no se exige que llegue un correo. Se verifica a quién se
 * dirige el envío (totalRecipients de la API) y lo que muestra la UI. Para saber quiénes
 * están en un plan sin depender de otros tests, se crea un alumno nuevo con un pago manual
 * en «QA Ilimitado» y se mide cuánto cambia el total de destinatarios de cada plan.
 * El push se usa como sonda: resuelve los mismos destinatarios que el correo y no envía
 * nada si nadie tiene token de dispositivo.
 */
import { test, expect } from '@playwright/test'
import { API_URL, QA, api, fetchRetry429, open, type Role } from '../support/qa'

const NORTE = QA.gyms.norte
const MENSUAL = NORTE.plans.mensual
const ILIMITADO = NORTE.plans.ilimitado
const SUR_PLAN = QA.gyms.sur.plans.mensual

async function planIdOf(role: Role, name: string): Promise<string> {
  const { data } = await api<any[]>(role, 'GET', '/plans')
  const plan = data.find(p => p.name === name)
  expect(plan, name).toBeTruthy()
  return plan.id
}

/** Destinatarios que resuelve la API para un plan (sonda con push; nadie tiene token) */
async function planRecipients(planId: string): Promise<number> {
  const { status, data } = await api('admin', 'POST', '/messages/push', { target: 'plan', planId, title: 'Sonda E2E', message: 'Sonda E2E' })
  expect(status, JSON.stringify(data)).toBe(200)
  return data.totalRecipients
}

test.describe('COM — comunicaciones', () => {
  test('COM-01 enviar a un plan → solo los destinatarios de ese plan', async ({ page }) => {
    const [mensualId, ilimitadoId, surPlanId] = await Promise.all([
      planIdOf('admin', MENSUAL.name), planIdOf('admin', ILIMITADO.name), planIdOf('adminSur', SUR_PLAN.name),
    ])

    // Alumno nuevo con plan Ilimitado activo (pago manual)
    const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`
    const email = `e2e-com-${suffix}@qa-norte.test`
    const created = await api('admin', 'POST', '/users', { name: `E2E Comunicación ${suffix}`, email, password: QA.password, role: 'MEMBER' })
    expect(created.status).toBe(201)
    const userId: string = created.data.id

    try {
      const beforeMensual = await planRecipients(mensualId)
      const beforeIlimitado = await planRecipients(ilimitadoId)
      const pay = await api('admin', 'POST', '/payments/manual', { userId, planId: ilimitadoId, paymentMethod: 'cash' })
      expect(pay.status).toBe(201)

      // El alumno cuenta solo para su plan
      expect(await planRecipients(ilimitadoId)).toBe(beforeIlimitado + 1)
      expect(await planRecipients(mensualId)).toBe(beforeMensual)
      // Seed: Mara y Mateo tienen QA Mensual activo
      expect(beforeMensual).toBeGreaterThanOrEqual(2)
      // Plan de otro gym: nadie
      expect(await planRecipients(surPlanId)).toBe(0)

      // UI: correo a «Alumnos de un plan»
      const p = await open(page, '/dashboard/communications')
      await page.getByRole('button', { name: 'Correo electrónico' }).click()
      const form = page.locator('form').filter({ has: page.getByRole('heading', { name: /Enviar correo/ }) })
      await form.locator('select').first().selectOption({ label: 'Alumnos de un plan' })
      const planSelect = form.locator('select').nth(1)
      const options = await planSelect.locator('option').allTextContents()
      expect(options).toEqual(expect.arrayContaining([MENSUAL.name, ILIMITADO.name]))
      expect(options).not.toContain(SUR_PLAN.name)
      await planSelect.selectOption(ilimitadoId)
      await form.getByPlaceholder(/Tu membresía está por vencer/).fill('Aviso E2E solo plan Ilimitado')
      await form.getByPlaceholder(/Escribe el contenido del correo/).fill('Hola {{nombre}}, este es un envío de prueba E2E.')

      const sendRes = page.waitForResponse(r => r.url() === `${API_URL}/messages/email` && r.request().method() === 'POST')
      await form.getByRole('button', { name: 'Enviar correo' }).click()
      const res = await sendRes
      expect(res.request().postDataJSON()).toMatchObject({ target: 'plan', planId: ilimitadoId })
      expect(res.status()).toBe(200)
      const body = await res.json()
      expect(body.totalRecipients).toBe(beforeIlimitado + 1)

      // La UI solo puede decir "enviado" si ningún envío falló — y ahora muestra el
      // conteo real de destinatarios (H-COM-01, docs/QA_COMUNICACIONES.md), no un
      // "enviado correctamente" genérico que no decía nada si falló todo o si el
      // segmento estaba vacío.
      const successText = new RegExp(`Email enviado a ${body.sent} de ${body.totalRecipients} alumno`)
      if (body.failed > 0) {
        await expect(page.getByText(successText), `API: ${JSON.stringify(body)}`).toHaveCount(0)
      } else {
        await expect(page.getByText(successText)).toBeVisible()
      }
      p.expectNoErrors()
    } finally {
      // Limpieza: el propio alumno borra su cuenta
      try {
        const login = await fetchRetry429(`${API_URL}/auth/login`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password: QA.password, gymSlug: NORTE.slug }),
        })
        const { token } = await login.json()
        await fetchRetry429(`${API_URL}/users/me`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } })
      } catch { /* best-effort */ }
    }
  })
})
