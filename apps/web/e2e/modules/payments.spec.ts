/**
 * PAY — Pagos (transferencias con comprobante, pago manual e historial)
 * Casos en docs/TESTING_STRATEGY.md §4.
 *
 * Re-ejecutable: cada test que confirma o rechaza crea su propio alumno, que sube su
 * comprobante por la API (multipart) y se borra al final (DELETE /users/me). Los datos
 * sembrados (Tomás, Rita, Fernanda) solo se leen, nunca se confirman ni rechazan aquí.
 */
import { test, expect, type Page } from '@playwright/test'
import { API_URL, QA, api, fetchRetry429, open, type Role } from '../support/qa'

const NORTE = QA.gyms.norte
const MENSUAL = NORTE.plans.mensual
const ILIMITADO = NORTE.plans.ilimitado
const DAY_MS = 86_400_000

// PNG 1x1 (el mismo que usa el seed para los comprobantes)
const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
)

// ─── Helpers locales ──────────────────────────────────────────────────────────

type Student = { id: string; name: string; email: string; token?: string }

async function planId(name: string): Promise<string> {
  const { status, data } = await api<any[]>('admin', 'GET', '/plans')
  expect(status).toBe(200)
  const plan = data.find(p => p.name === name)
  expect(plan, `plan ${name} en qa-box-norte`).toBeTruthy()
  return plan.id
}

/** Crea un alumno nuevo en qa-box-norte (nombre único para ubicarlo en la UI) */
async function createStudent(tag: string): Promise<Student> {
  const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`
  const name = `E2E ${tag} ${suffix}`
  const email = `e2e-pay-${suffix}@qa-norte.test`
  const { status, data } = await api('admin', 'POST', '/users', { name, email, password: QA.password, role: 'MEMBER' })
  expect(status, JSON.stringify(data)).toBe(201)
  return { id: data.id, name, email }
}

async function loginStudent(s: Student): Promise<string> {
  if (s.token) return s.token
  const res = await fetchRetry429(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: s.email, password: QA.password, gymSlug: NORTE.slug }),
  })
  expect(res.status, `login ${s.email}`).toBe(200)
  s.token = (await res.json()).token as string
  return s.token
}

/** El alumno sube su comprobante de transferencia (POST multipart /payments/transfer/receipt) */
async function uploadReceipt(s: Student, plan: string): Promise<any> {
  const token = await loginStudent(s)
  const form = new FormData()
  form.append('file', new Blob([PNG_1PX], { type: 'image/png' }), 'comprobante.png')
  const res = await fetchRetry429(`${API_URL}/payments/transfer/receipt?planId=${plan}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  })
  const body = await res.json()
  expect(res.status, JSON.stringify(body)).toBe(201)
  return body
}

/** Borra al alumno de prueba y sus datos (el propio alumno llama DELETE /users/me) */
async function deleteStudent(s: Student | undefined) {
  if (!s) return
  try {
    const token = await loginStudent(s)
    await fetchRetry429(`${API_URL}/users/me`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } })
  } catch { /* limpieza best-effort */ }
}

async function memberships(userId: string): Promise<any[]> {
  const { status, data } = await api('admin', 'GET', `/users/${userId}`)
  expect(status).toBe(200)
  return data.memberships
}

/** Fila de una transferencia pendiente en /dashboard/payments */
const pendingRow = (page: Page, name: string) => page.locator('div.px-5.py-4').filter({ hasText: name })

/** Monto como lo muestra Pagos: "49.990 CLP" */
const clpText = (pesos: number) => `${pesos.toLocaleString('es-CL')} CLP`

const expectAbout = (actual: string | Date, expected: number, label: string) => {
  const diff = Math.abs(new Date(actual).getTime() - expected)
  expect(diff, `${label}: ${new Date(actual).toISOString()} vs ${new Date(expected).toISOString()}`).toBeLessThan(DAY_MS / 2)
}

// ─── Tests ────────────────────────────────────────────────────────────────────

test.describe('PAY — transferencias', () => {
  test('PAY-01 transferencias pendientes visibles con comprobante', async ({ page }) => {
    const student = await createStudent('Pendiente')
    try {
      await uploadReceipt(student, await planId(ILIMITADO.name))

      const { data: pending } = await api<any[]>('admin', 'GET', '/payments/transfer/pending')
      const names = pending.map(m => m.user.name)
      // Datos sembrados: esta suite nunca confirma ni rechaza a Tomás ni a Rita
      expect(names).toEqual(expect.arrayContaining([NORTE.users.member3.name, NORTE.users.member5.name, student.name]))

      const p = await open(page, '/dashboard/payments')
      await expect(page.getByRole('button', { name: /Transferencias pendientes/ })).toContainText(String(pending.length))
      await expect(page.getByText(`${pending.length} pendientes`)).toBeVisible()

      for (const m of pending) {
        const row = pendingRow(page, m.user.email)
        await expect(row, m.user.name).toContainText(m.user.name)
        await expect(row, m.user.name).toContainText(`${m.plan.name} · ${clpText(m.pricePaid)} · 30 días`)
        await expect(row.getByRole('link', { name: 'Comprobante' }), m.user.name).toBeVisible()
        await expect(row.getByRole('button', { name: 'Confirmar' })).toBeVisible()
        await expect(row.getByRole('button', { name: 'Rechazar' })).toBeVisible()
      }

      // Los montos sembrados se muestran en pesos, sin multiplicar ni dividir por 100
      await expect(pendingRow(page, NORTE.users.member3.email)).toContainText(clpText(MENSUAL.priceCents))
      await expect(pendingRow(page, student.email)).toContainText(clpText(ILIMITADO.priceCents))

      // El enlace del comprobante abre la imagen (URL con token de medios)
      const href = await pendingRow(page, student.email).getByRole('link', { name: 'Comprobante' }).getAttribute('href')
      expect(href).toContain('/uploads/receipts/')
      const img = await page.request.get(href!)
      expect(img.status()).toBe(200)
      expect(img.headers()['content-type']).toContain('image/png')
      p.expectNoErrors()
    } finally {
      await deleteStudent(student)
    }
  })

  test('PAY-02 confirmar transferencia → membresía activa y sale de pendientes', async ({ page }) => {
    const student = await createStudent('Confirmar')
    try {
      const pending = await uploadReceipt(student, await planId(ILIMITADO.name))
      expect(pending).toMatchObject({ status: 'INACTIVE', transferStatus: 'PENDING_REVIEW', pricePaid: ILIMITADO.priceCents })

      const p = await open(page, '/dashboard/payments')
      const row = pendingRow(page, student.email)
      await expect(row).toContainText(clpText(ILIMITADO.priceCents))

      const confirmRes = page.waitForResponse(r => r.url().includes(`/payments/transfer/${pending.id}/confirm`))
      await row.getByRole('button', { name: 'Confirmar' }).click()
      expect((await confirmRes).status()).toBe(200)
      await expect(row).toHaveCount(0)

      // La membresía queda activa por 30 días y con el monto exacto del plan
      const confirmedAt = Date.now()
      const m = (await memberships(student.id)).find(x => x.id === pending.id)
      expect(m).toMatchObject({ status: 'ACTIVE', transferStatus: 'CONFIRMED', pricePaid: ILIMITADO.priceCents, paymentMethod: 'transfer' })
      expect(m.paidAt).toBeTruthy()
      expectAbout(m.endsAt, confirmedAt + 30 * DAY_MS, 'endsAt')

      const { data: stillPending } = await api<any[]>('admin', 'GET', '/payments/transfer/pending')
      expect(stillPending.map(x => x.id)).not.toContain(pending.id)

      // Aparece en el historial como transferencia activa
      await page.getByRole('button', { name: 'Historial' }).click()
      const histRow = page.locator('tr').filter({ hasText: student.email })
      await expect(histRow).toContainText(ILIMITADO.name)
      await expect(histRow).toContainText(clpText(ILIMITADO.priceCents))
      await expect(histRow).toContainText('Transferencia')
      await expect(histRow).toContainText('Activo')
      p.expectNoErrors()
    } finally {
      await deleteStudent(student)
    }
  })

  test('PAY-03 rechazar transferencia con motivo', async ({ page }) => {
    const student = await createStudent('Rechazar')
    const reason = 'Comprobante ilegible (E2E)'
    try {
      const pending = await uploadReceipt(student, await planId(MENSUAL.name))

      const p = await open(page, '/dashboard/payments')
      const row = pendingRow(page, student.email)
      await expect(row).toBeVisible()

      page.once('dialog', d => {
        expect(d.type()).toBe('prompt')
        d.accept(reason)
      })
      const rejectRes = page.waitForResponse(r => r.url().includes(`/payments/transfer/${pending.id}/reject`))
      await row.getByRole('button', { name: 'Rechazar' }).click()
      expect((await rejectRes).status()).toBe(200)
      await expect(row).toHaveCount(0)

      const m = (await memberships(student.id)).find(x => x.id === pending.id)
      expect(m).toMatchObject({ status: 'INACTIVE', transferStatus: 'REJECTED', paymentNotes: reason, paidAt: null })

      // Un rechazo no es un pago: no aparece en el historial
      await page.getByRole('button', { name: 'Historial' }).click()
      await expect(page.locator('tr').filter({ hasText: student.email })).toHaveCount(0)
      p.expectNoErrors()
    } finally {
      await deleteStudent(student)
    }
  })

  // BUG: submitTransferReceipt desactiva la membresía vigente apenas el alumno sube el
  // comprobante (antes de que el admin lo revise) y, al confirmar, ya no hay vigente desde
  // la cual extender: el alumno pierde acceso mientras espera y pierde los días que le quedaban.
  test('PAY-06 renovar por transferencia con plan vigente: sigue activo mientras se revisa y se extiende', async () => {
    const student = await createStudent('Renueva')
    try {
      const ilimitado = await planId(ILIMITADO.name)
      const manual = await api('admin', 'POST', '/payments/manual', { userId: student.id, planId: ilimitado, paymentMethod: 'cash' })
      expect(manual.status).toBe(201)
      const currentEndsAt = new Date(manual.data.endsAt).getTime()

      const pending = await uploadReceipt(student, ilimitado)

      // Mientras el admin no revisa, la membresía pagada sigue activa
      const during = await memberships(student.id)
      expect.soft(during.find(x => x.id === manual.data.id)?.status, 'membresía pagada tras subir comprobante').toBe('ACTIVE')

      const confirm = await api('admin', 'PATCH', `/payments/transfer/${pending.id}/confirm`)
      expect(confirm.status).toBe(200)
      // La renovación suma 30 días al vencimiento vigente (no desde hoy)
      expectAbout(confirm.data.endsAt, currentEndsAt + 30 * DAY_MS, 'endsAt de la renovación')
    } finally {
      await deleteStudent(student)
    }
  })

  test('PAY-07 el admin de otro gym no ve ni procesa transferencias de Norte', async () => {
    const student = await createStudent('Tenancy')
    try {
      const pending = await uploadReceipt(student, await planId(MENSUAL.name))

      const { data: surPending } = await api<any[]>('adminSur', 'GET', '/payments/transfer/pending')
      expect(surPending.map(m => m.id)).not.toContain(pending.id)

      const confirm = await api('adminSur', 'PATCH', `/payments/transfer/${pending.id}/confirm`)
      expect(confirm.status).toBeGreaterThanOrEqual(400)
      const reject = await api('adminSur', 'PATCH', `/payments/transfer/${pending.id}/reject`, { reason: 'x' })
      expect(reject.status).toBeGreaterThanOrEqual(400)

      const m = (await memberships(student.id)).find(x => x.id === pending.id)
      expect(m).toMatchObject({ status: 'INACTIVE', transferStatus: 'PENDING_REVIEW' })
    } finally {
      await deleteStudent(student)
    }
  })
})

test.describe('PAY — pago manual', () => {
  test('PAY-04 pago manual → aparece en el historial con el monto correcto', async ({ page }) => {
    const student = await createStudent('Manual')
    try {
      const ilimitado = await planId(ILIMITADO.name)
      const p = await open(page, `/dashboard/users/${student.id}`)
      await page.getByRole('button', { name: 'Registrar pago' }).click()

      const modal = page.locator('div.card').filter({ has: page.getByRole('heading', { name: 'Registrar pago' }) })
      await modal.locator('select').selectOption(ilimitado)
      await expect(modal).toContainText(`Precio: ${clpText(ILIMITADO.priceCents)}`)
      await modal.getByRole('button', { name: /Efectivo/ }).click()
      await modal.getByPlaceholder(/N° transferencia/).fill('E2E pago manual')

      const manualRes = page.waitForResponse(r => r.url().endsWith('/payments/manual') && r.request().method() === 'POST')
      await modal.getByRole('button', { name: 'Confirmar pago' }).click()
      expect((await manualRes).status()).toBe(201)
      await expect(page.getByText('Pago registrado correctamente')).toBeVisible()

      // API: membresía activa, 30 días, monto exacto del plan en pesos
      const m = (await memberships(student.id))[0]
      expect(m).toMatchObject({ status: 'ACTIVE', planId: ilimitado, pricePaid: ILIMITADO.priceCents, paymentMethod: 'cash', paymentNotes: 'E2E pago manual' })
      expectAbout(m.endsAt, Date.now() + 30 * DAY_MS, 'endsAt')
      const { data: history } = await api<any[]>('admin', 'GET', '/payments/history')
      expect(history.find(h => h.id === m.id)).toMatchObject({ pricePaid: ILIMITADO.priceCents })

      // UI: historial de Pagos
      await open(page, '/dashboard/payments')
      await page.getByRole('button', { name: 'Historial' }).click()
      const histRow = page.locator('tr').filter({ hasText: student.email })
      await expect(histRow).toContainText(ILIMITADO.name)
      await expect(histRow).toContainText(clpText(ILIMITADO.priceCents))
      await expect(histRow).toContainText('Efectivo')
      await expect(histRow).toContainText('Activo')
      p.expectNoErrors()
    } finally {
      await deleteStudent(student)
    }
  })
})
