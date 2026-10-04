/**
 * USR — Alumnos y personal
 * Casos en docs/TESTING_STRATEGY.md §4.
 *
 * Los alumnos que crean estos tests llevan nombre «QA E2E …» y email único. La API no tiene
 * endpoint para que un admin borre alumnos, así que quedan como inactivos; las membresías que
 * se activan aquí se desactivan al final para no inflar los KPIs de otros specs.
 */
import { readFileSync } from 'fs'
import { test, expect, type Page } from '@playwright/test'
import { QA, API_URL, api, authFile, open } from '../support/qa'

const NORTE = QA.gyms.norte
const SUR = QA.gyms.sur
const API_ORIGIN = API_URL.replace(/\/api$/, '')

/** PNG 1x1 válido */
const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
)

const uid = () => `${Date.now()}${Math.floor(Math.random() * 1000)}`

/** Input/select que sigue a un <label> (los formularios del panel no usan htmlFor) */
const field = (page: Page, label: string) =>
  page.locator(`xpath=//label[normalize-space()="${label}"]/following-sibling::*[self::input or self::select][1]`)

/** Crea un alumno por API (sin membresía) y devuelve su id */
async function createMember(tag: string) {
  const u = uid()
  const body = { name: `QA E2E ${tag} ${u}`, email: `qa-e2e-${tag.toLowerCase()}-${u}@qa-norte.test`, password: 'QaE2e2026!', role: 'MEMBER' }
  const res = await api('admin', 'POST', '/users', body)
  expect(res.status, JSON.stringify(res.data)).toBe(201)
  return { id: res.data.id as string, ...body }
}

/** Desactiva las membresías vigentes de un alumno (limpieza) */
async function deactivateMemberships(userId: string) {
  const { data } = await api('admin', 'GET', `/users/${userId}`)
  for (const m of data?.memberships ?? []) {
    if (m.status === 'ACTIVE' || m.status === 'TRIAL') await api('admin', 'PATCH', `/memberships/${m.id}`, { status: 'INACTIVE' })
  }
}

/** Media token guardado por auth.setup.ts para un rol (sin gastar un login) */
function storedMediaToken(role: 'admin' | 'adminSur'): string {
  const state = JSON.parse(readFileSync(authFile(role), 'utf-8'))
  return state.origins[0].localStorage.find((i: { name: string }) => i.name === 'fitapp_media_token').value
}

const DAY_MS = 86_400_000
const durationDays = (m: { startsAt: string; endsAt: string }) =>
  Math.round((new Date(m.endsAt).getTime() - new Date(m.startsAt).getTime()) / DAY_MS)

test.describe('USR — admin', () => {
  test('USR-01 la lista muestra los alumnos de Norte y ninguno de Sur', async ({ page }) => {
    const p = await open(page, '/dashboard/users')
    const table = page.getByRole('table')
    const seeded = Object.values(NORTE.users).filter(u => u.role === 'MEMBER')
    for (const u of seeded) await expect(table.getByText(u.email, { exact: true }), u.email).toBeVisible()
    for (const u of Object.values(SUR.users)) await expect(table.getByText(u.email, { exact: true }), u.email).toHaveCount(0)
    // El personal no aparece como alumno
    await expect(table.getByText(NORTE.users.admin.email, { exact: true })).toHaveCount(0)
    await expect(table.getByText(NORTE.users.coach.email, { exact: true })).toHaveCount(0)

    // El contador coincide con la API, y la API tampoco devuelve nada de Sur
    const { data } = await api('admin', 'GET', '/users')
    const emails: string[] = data.map((u: { email: string }) => u.email)
    expect(emails.filter(e => e.endsWith('@qa-sur.test'))).toEqual([])
    await expect(page.getByText(new RegExp(`^${data.length} alumnos?`))).toBeVisible()
    p.expectNoErrors()
  })

  test('USR-02 crear alumno → aparece en la lista', async ({ page }) => {
    const u = uid()
    const name = `QA E2E Nuevo ${u}`
    const email = `qa-e2e-nuevo-${u}@qa-norte.test`
    const p = await open(page, '/dashboard/users/new')
    await field(page, 'Nombre completo *').fill(name)
    await field(page, 'Email *').fill(email)
    await field(page, 'Contraseña *').fill('QaE2e2026!')
    await field(page, 'Género').selectOption('F')
    await page.getByRole('button', { name: 'Crear alumno' }).click()

    await expect(page).toHaveURL(/\/dashboard\/users$/)
    await page.getByPlaceholder('Buscar alumno...').fill(email)
    const row = page.getByRole('row').filter({ hasText: email })
    await expect(row).toContainText(name)
    await expect(row).toContainText('Sin plan')

    // Persistido en la API, en el gym del admin
    const { data } = await api('admin', 'GET', '/users')
    expect(data.filter((x: { email: string }) => x.email === email)).toHaveLength(1)
    p.expectNoErrors()
  })

  test('USR-02b buscar sin tildes encuentra alumnos con tildes en el nombre', async ({ page }) => {
    const u = uid()
    const name = `QA E2E José Pérez ${u}`
    const email = `qa-e2e-tildes-${u}@qa-norte.test`
    const res = await api('admin', 'POST', '/users', { name, email, password: 'QaE2e2026!', role: 'MEMBER' })
    expect(res.status, JSON.stringify(res.data)).toBe(201)

    const p = await open(page, '/dashboard/users')
    await page.getByPlaceholder('Buscar alumno...').fill(`jose perez ${u}`)
    await expect(page.getByRole('row').filter({ hasText: email })).toContainText(name)
    p.expectNoErrors()
  })

  test('USR-03 email duplicado en el mismo gym → error claro', async ({ page }) => {
    const dup = NORTE.users.member.email
    const p = await open(page, '/dashboard/users/new')
    await field(page, 'Nombre completo *').fill(`QA E2E Duplicado ${uid()}`)
    await field(page, 'Email *').fill(dup)
    await field(page, 'Contraseña *').fill('QaE2e2026!')
    await page.getByRole('button', { name: 'Crear alumno' }).click()

    await expect(page.getByText(/email ya está registrado en este gimnasio/i)).toBeVisible()
    await expect(page).toHaveURL(/\/dashboard\/users\/new$/)
    const { data } = await api('admin', 'GET', '/users')
    expect(data.filter((x: { email: string }) => x.email === dup)).toHaveLength(1)
    p.expectNoErrors()
  })

  // BUG: el detalle del alumno no muestra asistencia (page.tsx ~L605 calcula `attendedCount` y no
  // lo usa; GET /users/:id no incluye reservas). El resto del caso (membresía, RMs, hitos) pasa.
  test('USR-04 detalle del alumno: membresía, RMs y asistencia del seed', async ({ page }) => {
    const mara = NORTE.users.member
    const p = await open(page, '/dashboard/users')
    await page.getByRole('row').filter({ hasText: mara.email }).getByRole('button', { name: /Ver/ }).click()
    await expect(page).toHaveURL(/\/dashboard\/users\/[0-9a-f-]{36}$/)
    await expect(page.getByRole('heading', { level: 1, name: mara.name })).toBeVisible()
    await expect(page.getByText(`RUT: ${mara.rut}`)).toBeVisible()

    // Membresía activa: QA Mensual, pagada en forma manual, vence en ~25 días
    const activa = page.locator('.card').filter({ has: page.getByRole('heading', { name: 'Membresía activa' }) })
    await expect(activa).toContainText(NORTE.plans.mensual.name)
    await expect(activa).toContainText(/2[4-6]d restantes/)
    const historial = page.locator('.card').filter({ has: page.getByRole('heading', { name: 'Historial de membresías' }) })
    await expect(historial).toContainText('35.000 CLP')

    // RMs: mejor marca por movimiento (Back Squat 105 > 100)
    const rms = page.locator('.card').filter({ has: page.getByRole('heading', { name: 'Récords personales' }) })
    await expect(rms).toContainText('3 movimientos')
    for (const [mov, kg] of [['Back Squat', '105'], ['Deadlift', '130'], ['Thruster', '60']]) {
      await expect(rms.locator('div').filter({ hasText: mov }).filter({ hasText: `${kg}kg` }).first(), mov).toBeVisible()
    }
    await expect(rms).not.toContainText('100kg')

    // Progresión gimnástica sembrada
    await expect(page.getByText('Pull-up estricto')).toBeVisible()

    // Asistencia: Mara asistió 4 clases en la última semana (tarjeta con número y etiqueta separados)
    const asistencias = page.locator('.stat-card').filter({ hasText: 'Asistencias' })
    await expect(asistencias, 'el detalle no muestra la tarjeta de asistencias').toBeVisible()
    await expect(asistencias.locator('.stat-number')).toHaveText('4')
    p.expectNoErrors()
  })

  test('USR-05 avatar: subir y ver; la URL sin token responde 401', async ({ page }) => {
    const m = await createMember('Avatar')
    const p = await open(page, `/dashboard/users/${m.id}`)
    await page.getByRole('button', { name: 'Editar' }).click()
    await page.locator('input[type="file"][accept="image/*"]').setInputFiles({ name: 'avatar.png', mimeType: 'image/png', buffer: PNG_1PX })
    await page.getByRole('button', { name: 'Guardar' }).click()
    await expect(page.getByText('Datos actualizados')).toBeVisible()

    // Se ve: la imagen carga (naturalWidth > 0) usando el token de medios
    const img = page.getByRole('img', { name: m.name })
    await expect(img).toBeVisible()
    await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth)).toBeGreaterThan(0)
    const src = (await img.getAttribute('src'))!
    expect(src).toMatch(/\/uploads\/avatars\/.+\?t=/)

    // Sin token → 401; con el token de medios → 200
    const bare = src.split('?')[0]
    expect((await fetch(bare)).status).toBe(401)
    expect((await fetch(src)).status).toBe(200)
    // El JWT de sesión no sirve como token de medios en la query
    const sessionJwt = await page.evaluate(() => localStorage.getItem('fitapp_token'))
    expect((await fetch(`${bare}?t=${encodeURIComponent(sessionJwt!)}`)).status).toBe(401)
    const { data: detail } = await api('admin', 'GET', `/users/${m.id}`)
    expect(detail.avatarUrl).toMatch(/^\/uploads\/avatars\//)
    p.expectNoErrors()
  })

  test('USR-10 avatar de Norte con el token de medios de Sur → rechazado', async () => {
    const m = await createMember('AvatarSur')
    const form = new FormData()
    form.append('file', new Blob([PNG_1PX], { type: 'image/png' }), 'avatar.png')
    const token = JSON.parse(readFileSync(authFile('admin'), 'utf-8')).origins[0].localStorage
      .find((i: { name: string }) => i.name === 'fitapp_token').value
    const up = await fetch(`${API_URL}/users/${m.id}/avatar`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form })
    expect(up.status).toBe(200)
    const { avatarUrl } = await up.json()

    const norteOk = await fetch(`${API_ORIGIN}${avatarUrl}?t=${encodeURIComponent(storedMediaToken('admin'))}`)
    expect(norteOk.status).toBe(200)
    const surTry = await fetch(`${API_ORIGIN}${avatarUrl}?t=${encodeURIComponent(storedMediaToken('adminSur'))}`)
    expect([401, 403, 404]).toContain(surTry.status)
  })

  test('USR-06 asignar y renovar membresía → 30 días', async ({ page }) => {
    const m = await createMember('Membresia')
    try {
      const p = await open(page, `/dashboard/users/${m.id}`)
      const activa = page.locator('.card').filter({ has: page.getByRole('heading', { name: 'Membresía activa' }) })
      await expect(activa).toContainText('Sin membresía activa')

      // Asignar: «+ Asignar plan» → pago presencial en efectivo del plan QA Mensual
      await activa.getByRole('button', { name: '+ Asignar plan' }).click()
      const modal = page.locator('.modal-animate').filter({ has: page.getByRole('heading', { name: 'Registrar pago' }) })
      const planOption = modal.locator('select option').filter({ hasText: NORTE.plans.mensual.name })
      await modal.locator('select').selectOption({ value: (await planOption.getAttribute('value'))! })
      await expect(modal).toContainText('Duración: 30 días')
      await modal.getByRole('button', { name: 'Confirmar pago' }).click()
      await expect(page.getByText('Pago registrado correctamente')).toBeVisible()
      await expect(activa).toContainText(NORTE.plans.mensual.name)
      await expect(activa).toContainText(/(29|30)d restantes/)

      let { data } = await api('admin', 'GET', `/users/${m.id}`)
      let active = data.memberships.filter((x: { status: string }) => x.status === 'ACTIVE')
      expect(active).toHaveLength(1)
      expect(durationDays(active[0])).toBe(30)
      expect(active[0].pricePaid).toBe(NORTE.plans.mensual.priceCents)
      const firstId = active[0].id

      // Renovar antes del vencimiento extiende desde el vencimiento vigente (no reinicia el
      // contador): con ~30 días restantes, tras renovar quedan ~60 (30 + 30 nuevos)
      await page.getByRole('button', { name: 'Renovar' }).first().click()
      await expect(page.getByText('Membresía renovada')).toBeVisible()
      await expect(activa).toContainText(/(59|60)d restantes/)

      ;({ data } = await api('admin', 'GET', `/users/${m.id}`))
      active = data.memberships.filter((x: { status: string }) => x.status === 'ACTIVE')
      expect(active).toHaveLength(1)
      expect(active[0].id).not.toBe(firstId)
      expect(durationDays(active[0])).toBe(30)
      expect(data.memberships).toHaveLength(2)
      p.expectNoErrors()
    } finally {
      await deactivateMemberships(m.id)
    }
  })

  test('USR-09 GET /users/:id no expone datos sensibles', async () => {
    const { status, data } = await api('admin', 'GET', '/users')
    expect(status).toBe(200)
    const { data: detail } = await api('admin', 'GET', `/users/${data[0].id}`)
    expect(detail).not.toHaveProperty('passwordHash')
    for (const u of data) expect(u).not.toHaveProperty('passwordHash')
  })
})

test.describe('USR — aislamiento', () => {
  test.use({ storageState: authFile('adminSur') })

  test('USR-11 el admin de Sur no ve alumnos de Norte ni su detalle por URL', async ({ page }) => {
    const p = await open(page, '/dashboard/users')
    const table = page.getByRole('table')
    await expect(table.getByText(SUR.users.member.email, { exact: true })).toBeVisible()
    for (const u of Object.values(NORTE.users)) await expect(table.getByText(u.email, { exact: true }), u.email).toHaveCount(0)

    // Detalle de una alumna de Norte por URL directa → la API responde 404 y la web vuelve a la lista
    const { data } = await api('admin', 'GET', '/users')
    const maraId = data.find((u: { email: string }) => u.email === NORTE.users.member.email).id
    expect((await api('adminSur', 'GET', `/users/${maraId}`)).status).toBe(404)
    await page.goto(`/dashboard/users/${maraId}`)
    await expect(page).toHaveURL(/\/dashboard\/users$/)
    await expect(page.getByText(NORTE.users.member.name)).toHaveCount(0)
    p.expectNoErrors()
  })
})
