/**
 * SUP — Superadmin y sedes. Casos en docs/TESTING_STRATEGY.md §4.
 *
 * No crea ni borra gyms. El cambio de sede (SUP-02) ocurre solo en el contexto del
 * navegador de este test: no toca playwright/.auth/superadmin.json.
 */
import { test, expect } from '@playwright/test'
import { QA, api, API_URL, authFile, open } from '../support/qa'

const { norte, sur } = QA.gyms

test.describe('SUP — superadmin', () => {
  test.use({ storageState: authFile('superadmin') })

  test('SUP-01 la lista de gyms incluye qa-box-norte y qa-box-sur', async ({ page }) => {
    const p = await open(page, '/superadmin')
    await expect(page.getByRole('heading', { name: 'Gimnasios' })).toBeVisible()
    for (const gym of [norte, sur]) {
      const row = page.getByRole('row', { name: new RegExp(gym.slug) })
      await expect(row, gym.slug).toBeVisible()
      await expect(row).toContainText(gym.name)
    }
    // El detalle de un gym abre desde la lista
    await page.getByRole('row', { name: new RegExp(norte.slug) }).getByTitle('Editar gimnasio').click()
    await expect(page).toHaveURL(/\/superadmin\/[0-9a-f-]{36}$/)
    await expect(page.getByRole('heading', { name: norte.name })).toBeVisible()
    await expect.poll(() => page.locator('input').evaluateAll(els => els.map(e => (e as HTMLInputElement).value)))
      .toEqual(expect.arrayContaining([norte.users.admin.email, norte.slug]))
    p.expectNoErrors()
  })

  // BUG: /gyms/switch-sede solo permite gyms cuyo ownerEmail es el del solicitante
  // (gyms.routes.ts, handler de switch-sede), así que un SUPER_ADMIN no puede entrar a ningún gym de
  // cliente: /gyms/my-sedes le devuelve [] y el panel /superadmin no ofrece "entrar al gym".
  test('SUP-02 cambiar de sede → entra al dashboard de ese gym', async ({ page }) => {
    const gyms = (await api('superadmin', 'GET', '/superadmin/gyms')).data as { id: string; slug: string }[]
    const target = gyms.find(g => g.slug === norte.slug)!
    expect(target, 'qa-box-norte en /superadmin/gyms').toBeTruthy()

    // Flujo de la web: /dashboard/sedes lista las sedes disponibles y "Cambiar a esta sede"
    await open(page, '/dashboard/sedes')
    const card = page.locator('div', { has: page.getByText(norte.slug, { exact: true }) })
      .filter({ has: page.getByRole('button', { name: /Cambiar a esta sede/ }) }).last()
    await expect(card, 'qa-box-norte aparece en Mis sedes del superadmin').toBeVisible()
    await card.getByRole('button', { name: /Cambiar a esta sede/ }).click()

    await expect(page).toHaveURL(/\/dashboard$/)
    await expect(page.locator('aside').getByText(norte.name).first()).toBeVisible()
    const session = await page.evaluate(() => JSON.parse(localStorage.getItem('fitapp_user') ?? '{}'))
    expect(session.gymId).toBe(target.id)
    // Y la API responde con datos de ese gym (no de otro)
    const me = await page.evaluate(async (url) => {
      const r = await fetch(`${url}/gyms/me`, { headers: { Authorization: `Bearer ${localStorage.getItem('fitapp_token')}` } })
      return r.json()
    }, API_URL)
    expect(me.slug).toBe(norte.slug)
  })

  test('SUP-02b switch-sede por API a un gym de cliente → token con ese gymId', async () => {
    const gyms = (await api('superadmin', 'GET', '/superadmin/gyms')).data as { id: string; slug: string }[]
    const target = gyms.find(g => g.slug === norte.slug)!
    const res = await api('superadmin', 'POST', '/gyms/switch-sede', { targetGymId: target.id })
    expect(res.status, JSON.stringify(res.data)).toBe(200)
    expect(res.data.user.gymId).toBe(target.id)
  })

  // Endurecimiento: la lista y el detalle de gyms devuelven las columnas completas de Gym,
  // incluidas credenciales de cada cliente (superadmin.routes.ts GET /superadmin/gyms y /:id).
  test('SUP-05 la API del panel no expone credenciales de los gyms (SMTP, Bsale, pasarelas)', async () => {
    const SECRETS = ['smtpPass', 'bsaleToken', 'paymentGateways']
    const list = (await api('superadmin', 'GET', '/superadmin/gyms')).data as Record<string, unknown>[]
    const n = list.find(g => g.slug === norte.slug)!
    for (const key of SECRETS) expect(n, `/superadmin/gyms expone ${key}`).not.toHaveProperty(key)
    const detail = (await api('superadmin', 'GET', `/superadmin/gyms/${n.id}`)).data
    for (const key of SECRETS) expect(detail, `/superadmin/gyms/:id expone ${key}`).not.toHaveProperty(key)
  })
})

test.describe('SUP — otros roles', () => {
  test('SUP-06 un ADMIN de gym no entra al panel ni a la API de superadmin', async ({ page }) => {
    expect((await api('admin', 'GET', '/superadmin/gyms')).status).toBe(403)
    expect((await api('admin', 'GET', '/superadmin/stats')).status).toBe(403)
    await page.goto('/superadmin')
    await expect(page).not.toHaveURL(/\/superadmin$/, { timeout: 15_000 })
    await expect(page.getByText(sur.name)).toHaveCount(0)
  })
})
