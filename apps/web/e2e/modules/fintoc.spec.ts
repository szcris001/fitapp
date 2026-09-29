/**
 * FIN — Conciliación bancaria (Fintoc)
 * Casos en docs/TESTING_STRATEGY.md §4.
 *
 * Opera sobre los dos movimientos del seed (no hay forma de crear movimientos sin firmar
 * un webhook con el secret de Fintoc del gym):
 *   - RUT 44.444.444-4, $35.000, MATCHED con la transferencia pendiente de Fernanda Fintoc
 *   - RUT 99.999.999-9, $12.345, PENDING (sin identificar)
 * FIN-02 y FIN-03 consumen esos movimientos: requieren seed fresco (`pnpm seed:qa`) y se
 * saltan con un aviso si ya fueron procesados.
 */
import { test, expect, type Page } from '@playwright/test'
import { QA, api as rawApi, open, type Role } from '../support/qa'

// Margen para los reintentos ante 429
test.describe.configure({ timeout: 120_000 })

/**
 * api() con reintento ante 429: el rate limit global (120 req/min por IP) lo comparten
 * todos los procesos que corren contra la API local. Solo reintenta el 429.
 */
async function api<T = any>(role: Role, method: string, path: string, body?: unknown) {
  for (let attempt = 0; ; attempt++) {
    const res = await rawApi<T>(role, method, path, body)
    if (res.status !== 429 || attempt >= 8) return res
    await new Promise(r => setTimeout(r, 5_000))
  }
}

const NORTE = QA.gyms.norte
const FERNANDA = NORTE.users.member4
const MENSUAL = NORTE.plans.mensual
const RUT_MATCH = '44.444.444-4'
const RUT_UNKNOWN = '99.999.999-9'
const DAY_MS = 86_400_000

const TAB_LABEL: Record<string, RegExp> = {
  PENDING: /^Pendientes/,
  MATCHED: /^Coincidencias/,
  CONFIRMED: /^Confirmados/,
  REJECTED: /^Rechazados/,
}
const BADGE: Record<string, string> = { PENDING: 'Pendiente', MATCHED: 'Coincidencia', CONFIRMED: 'Confirmado', REJECTED: 'Rechazado' }

/** Monto como lo muestra Conciliación: "$ 35.000" (se tolera sin espacio) */
const amountRe = (pesos: number) => new RegExp(`\\$\\s?${pesos.toLocaleString('es-CL').replace('.', '\\.')}`)

async function seededMovements() {
  const { status, data } = await api('admin', 'GET', '/payments/fintoc/movements?limit=200')
  expect(status).toBe(200)
  const byRut = (rut: string) => data.movements.find((m: any) => m.senderRut === rut)
  const matched = byRut(RUT_MATCH)
  const unknown = byRut(RUT_UNKNOWN)
  expect(matched, `movimiento ${RUT_MATCH} del seed`).toBeTruthy()
  expect(unknown, `movimiento ${RUT_UNKNOWN} del seed`).toBeTruthy()
  return { matched, unknown }
}

async function showTab(page: Page, status: string) {
  // Pendientes es la pestaña inicial: hacer clic en la pestaña activa no vuelve a pedir la lista
  await page.getByRole('button', { name: TAB_LABEL[status] }).click()
  await expect(page.locator('h2').filter({ hasText: TAB_LABEL[status] })).toBeVisible()
  await expect(page.getByText('Cargando movimientos...')).toHaveCount(0)
}

const movementRow = (page: Page, rut: string) => page.locator('tbody tr').filter({ hasText: rut })

test.describe('FIN — conciliación', () => {
  test('FIN-01 lista el movimiento calzado por RUT y el sin identificar', async ({ page }) => {
    const { matched, unknown } = await seededMovements()
    const { data: status } = await api('admin', 'GET', '/payments/fintoc/status')

    const p = await open(page, '/dashboard/fintoc')
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/Conciliaci[oó]n Bancaria/)
    await expect(page.getByText('Banco QA').first()).toBeVisible()
    await expect(page.getByRole('button', { name: 'Sincronizar' })).toBeVisible()
    // Contadores de las pestañas = API
    if (status.pendingCount > 0) await expect(page.getByRole('button', { name: TAB_LABEL.PENDING })).toContainText(String(status.pendingCount))
    if (status.matchedCount > 0) await expect(page.getByRole('button', { name: TAB_LABEL.MATCHED })).toContainText(String(status.matchedCount))

    // Movimiento calzado por RUT (MATCHED con seed fresco): monto, emisor, confianza y alumna
    await showTab(page, matched.reconciliationStatus)
    const rowMatch = movementRow(page, RUT_MATCH)
    await expect(rowMatch).toContainText(amountRe(MENSUAL.priceCents))
    await expect(rowMatch).toContainText(FERNANDA.name)
    await expect(rowMatch).toContainText(BADGE[matched.reconciliationStatus])
    await expect(rowMatch).toContainText('RUT exacto')
    await expect(rowMatch).toContainText(MENSUAL.name)

    // Movimiento sin identificar (PENDING con seed fresco): sin alumno vinculado
    await showTab(page, unknown.reconciliationStatus)
    const rowUnknown = movementRow(page, RUT_UNKNOWN)
    await expect(rowUnknown).toContainText(amountRe(12345))
    await expect(rowUnknown).toContainText('Desconocido')
    await expect(rowUnknown).toContainText(BADGE[unknown.reconciliationStatus])

    const canAct = (s: string) => s === 'PENDING' || s === 'MATCHED'
    if (canAct(unknown.reconciliationStatus)) {
      await expect(rowUnknown.getByRole('button', { name: 'Confirmar' })).toBeVisible()
      await expect(rowUnknown.getByRole('button', { name: 'Rechazar' })).toBeVisible()
    }
    p.expectNoErrors()
  })

  test('FIN-02 confirmar el movimiento calzado → activa la membresía de Fernanda', async ({ page }) => {
    const { matched } = await seededMovements()
    test.skip(matched.reconciliationStatus !== 'MATCHED', `requiere seed fresco (movimiento en ${matched.reconciliationStatus})`)
    const membershipId: string = matched.membershipId
    const fernandaId: string = matched.membership.user.id

    const p = await open(page, '/dashboard/fintoc')
    await showTab(page, 'MATCHED')
    await movementRow(page, RUT_MATCH).getByRole('button', { name: 'Confirmar' }).click()

    const form = page.locator('form').filter({ has: page.getByRole('button', { name: 'Confirmar' }) })
    await expect(page.getByRole('heading', { name: 'Confirmar movimiento' })).toBeVisible()
    await expect(form.getByPlaceholder(/UUID de la membresía/)).toHaveValue(membershipId)
    await expect(form.getByPlaceholder(/UUID de la membresía/)).toBeDisabled()

    const confirmRes = page.waitForResponse(r => r.url().includes(`/payments/fintoc/movements/${matched.id}/confirm`))
    await form.getByRole('button', { name: 'Confirmar' }).click()
    expect((await confirmRes).status()).toBe(200)
    await expect(page.getByRole('heading', { name: 'Confirmar movimiento' })).toHaveCount(0)
    await expect(movementRow(page, RUT_MATCH)).toHaveCount(0)

    // Movimiento confirmado y visible en su pestaña
    const { matched: after } = await seededMovements()
    expect(after).toMatchObject({ reconciliationStatus: 'CONFIRMED', membershipId })
    expect(after.reviewedAt).toBeTruthy()
    await showTab(page, 'CONFIRMED')
    await expect(movementRow(page, RUT_MATCH)).toContainText('Confirmado')

    // Membresía de Fernanda activa por 30 días, con el monto exacto del plan
    const { data: fernanda } = await api('admin', 'GET', `/users/${fernandaId}`)
    const m = fernanda.memberships.find((x: any) => x.id === membershipId)
    expect(m).toMatchObject({ status: 'ACTIVE', transferStatus: 'CONFIRMED', pricePaid: MENSUAL.priceCents })
    expect(m.paidAt).toBeTruthy()
    expect(Math.abs(new Date(m.endsAt).getTime() - (Date.now() + 30 * DAY_MS))).toBeLessThan(DAY_MS / 2)

    // Ya no aparece como transferencia pendiente en Pagos
    const { data: pending } = await api<any[]>('admin', 'GET', '/payments/transfer/pending')
    expect(pending.map(x => x.id)).not.toContain(membershipId)
    p.expectNoErrors()
  })

  test('FIN-03 rechazar el movimiento sin identificar', async ({ page }) => {
    const { unknown } = await seededMovements()
    test.skip(unknown.reconciliationStatus !== 'PENDING', `requiere seed fresco (movimiento en ${unknown.reconciliationStatus})`)
    const reason = 'No corresponde a ningún alumno (E2E)'

    const p = await open(page, '/dashboard/fintoc')
    await showTab(page, 'PENDING')
    await movementRow(page, RUT_UNKNOWN).getByRole('button', { name: 'Rechazar' }).click()

    await expect(page.getByRole('heading', { name: 'Rechazar movimiento' })).toBeVisible()
    const form = page.locator('form').filter({ has: page.getByRole('button', { name: 'Rechazar' }) })
    await form.getByPlaceholder(/Transferencia duplicada/).fill(reason)
    const rejectRes = page.waitForResponse(r => r.url().includes(`/payments/fintoc/movements/${unknown.id}/reject`))
    await form.getByRole('button', { name: 'Rechazar' }).click()
    expect((await rejectRes).status()).toBe(200)
    await expect(movementRow(page, RUT_UNKNOWN)).toHaveCount(0)

    const { unknown: after } = await seededMovements()
    expect(after.reconciliationStatus).toBe('REJECTED')
    expect(after.membershipId).toBeNull()
    expect(after.reviewedAt).toBeTruthy()
    expect(after.description).toContain(reason)

    await showTab(page, 'REJECTED')
    await expect(movementRow(page, RUT_UNKNOWN)).toContainText('Rechazado')
    p.expectNoErrors()
  })

  test('FIN-05 el admin de otro gym no ve ni procesa los movimientos de Norte', async () => {
    const { matched, unknown } = await seededMovements()
    const { data } = await api('adminSur', 'GET', '/payments/fintoc/movements?limit=200')
    const surIds = (data.movements ?? []).map((m: any) => m.id)
    expect(surIds).not.toContain(matched.id)
    expect(surIds).not.toContain(unknown.id)

    // Intentos sobre IDs de Norte: rechazados y sin efecto
    const confirm = await api('adminSur', 'PATCH', `/payments/fintoc/movements/${unknown.id}/confirm`, { membershipId: matched.membershipId ?? unknown.id })
    expect(confirm.status).toBeGreaterThanOrEqual(400)
    const reject = await api('adminSur', 'PATCH', `/payments/fintoc/movements/${matched.id}/reject`, { reason: 'x' })
    expect(reject.status).toBeGreaterThanOrEqual(400)
    const { matched: m2, unknown: u2 } = await seededMovements()
    expect(m2.reconciliationStatus).toBe(matched.reconciliationStatus)
    expect(u2.reconciliationStatus).toBe(unknown.reconciliationStatus)
  })
})
