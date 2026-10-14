/**
 * STF — Personal y coaches (/dashboard/staff)
 *
 * Los coaches que crean estos tests llevan nombre «QA E2E …» y email único, igual que los
 * alumnos de users.spec.ts — no hay endpoint para borrarlos, quedan como registros QA.
 */
import { test, expect } from '@playwright/test'
import { QA, API_URL, api, authFile, open } from '../support/qa'

const NORTE = QA.gyms.norte
const uid = () => `${Date.now()}${Math.floor(Math.random() * 1000)}`

/** Crea un coach por API y devuelve sus credenciales iniciales */
async function createCoach(tag: string) {
  const u = uid()
  const body = { name: `QA E2E ${tag} ${u}`, email: `qa-e2e-staff-${tag.toLowerCase()}-${u}@qa-norte.test`, password: 'QaE2e2026!', role: 'COACH' }
  const res = await api('admin', 'POST', '/users', body)
  expect(res.status, JSON.stringify(res.data)).toBe(201)
  return { id: res.data.id as string, ...body }
}

test.describe('STF — admin', () => {
  test.use({ storageState: authFile('admin') })

  test('STF-01 resetear contraseña de un coach desde Editar: la vieja deja de servir, la nueva funciona', async ({ page }) => {
    const coach = await createCoach('ResetPw')
    const p = await open(page, '/dashboard/staff')

    // Solo una fila puede estar en edición a la vez: una vez clickeado "Editar", el email
    // pasa a vivir en el `value` de un input (no en texto), así que de acá en más se
    // localizan los botones a nivel página en vez de seguir filtrando la fila por hasText.
    await page.locator('tr').filter({ hasText: coach.email }).getByRole('button', { name: 'Editar' }).click()
    await page.getByRole('button', { name: 'Resetear contraseña' }).click()

    const modal = page.locator('.modal-animate').filter({ has: page.getByRole('heading', { name: 'Resetear contraseña' }) })
    await modal.locator('input[type="text"]').fill('QaE2eNuevaClave2026!')
    await modal.getByRole('button', { name: 'Resetear' }).click()
    await expect(page.getByText('Contraseña reseteada')).toBeVisible()

    const oldLogin = await fetch(`${API_URL}/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: coach.email, password: coach.password, gymSlug: NORTE.slug }),
    })
    expect(oldLogin.status).toBe(401)

    const newLogin = await fetch(`${API_URL}/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: coach.email, password: 'QaE2eNuevaClave2026!', gymSlug: NORTE.slug }),
    })
    expect(newLogin.status).toBe(200)
    const { user } = await newLogin.json()
    // El coach debe cambiarla en su próximo login — mismo flag que el reset de un alumno
    expect(user.mustChangePassword).toBe(true)

    p.expectNoErrors()
  })
})
