/**
 * SEC — Transversal de seguridad. Casos en docs/TESTING_STRATEGY.md §4.
 *
 * Aislamiento entre gyms: el admin de qa-box-sur intenta ver datos de qa-box-norte por la
 * UI y por la API (con IDs reales de Norte obtenidos como admin de Norte). Cualquier fuga
 * es S1. Las pruebas de escritura usan cuerpos no-op (el mismo valor que ya tiene el
 * recurso) para no romper nada si el aislamiento fallara.
 */
import { test, expect, type Page } from '@playwright/test'
import { existsSync, readFileSync } from 'fs'
import { QA, api, API_URL, authFile, fetchRetry429, login, open, secondsLeft, type Role } from '../support/qa'

// ─── Datos de Norte ───────────────────────────────────────────────────────────

const { norte, sur } = QA.gyms
const NORTE_MEMBER_NAMES = Object.values(norte.users).filter(u => u.role === 'MEMBER').map(u => u.name)

type NorteData = {
  gymId: string
  member: { id: string; name: string }
  userIds: string[]
  classIds: string[]
  wodIds: string[]
  planIds: string[]
  membershipIds: string[]
}

let cached: NorteData | null = null
async function norteData(): Promise<NorteData> {
  if (cached) return cached
  const get = async (path: string) => {
    const res = await api('admin', 'GET', path)
    expect(res.status, `admin Norte GET ${path}`).toBe(200)
    return res.data
  }
  const [gym, users, classes, wods, plans, history, pending] = await Promise.all([
    get('/gyms/me'), get('/users'), get('/classes'), get('/wods'), get('/plans'),
    get('/payments/history'), get('/payments/transfer/pending'),
  ])
  const member = users.find((u: any) => u.email === norte.users.member.email)
  expect(member, 'alumna Mara en Norte').toBeTruthy()
  cached = {
    gymId: gym.id,
    member: { id: member.id, name: member.name },
    userIds: users.map((u: any) => u.id),
    classIds: classes.map((c: any) => c.id),
    wodIds: wods.map((w: any) => w.id),
    planIds: plans.map((p: any) => p.id),
    membershipIds: [...history, ...pending].map((m: any) => m.id),
  }
  return cached
}

/** Rastros de Norte dentro de una respuesta (IDs, gymId, emails o nombres de alumnos) */
function norteTraces(data: unknown, n: NorteData): string[] {
  const s = JSON.stringify(data ?? '')
  const markers = [
    n.gymId, ...n.userIds, ...n.classIds, ...n.wodIds, ...n.planIds, ...n.membershipIds,
    '@qa-norte.test', ...NORTE_MEMBER_NAMES, norte.users.coach.name,
  ]
  return [...new Set(markers.filter(m => s.includes(m)))]
}

/** Recurso ajeno: 403/404, o 200 sin ningún dato de Norte (p. ej. lista vacía) */
function expectDenied(res: { status: number; data: unknown }, n: NorteData, what: string) {
  if (res.status === 200) {
    expect(norteTraces(res.data, n), `${what} → 200 con datos de Norte`).toEqual([])
  } else {
    expect([401, 403, 404], `${what} → ${res.status} ${JSON.stringify(res.data).slice(0, 120)}`).toContain(res.status)
  }
}

async function expectPageClean(page: Page, path: string, n: NorteData) {
  await open(page, path)
  await page.waitForLoadState('networkidle')
  const text = await page.locator('main').innerText()
  expect(norteTraces(text, n), `${path} muestra datos de Norte`).toEqual([])
}

// ─── SEC-01 / SEC-02: aislamiento entre gyms ──────────────────────────────────

test.describe('SEC — admin de Sur contra datos de Norte', () => {
  test.use({ storageState: authFile('adminSur') })

  test('SEC-01 (API) las listas del admin de Sur no traen alumnos, clases, WODs, planes ni pagos de Norte', async () => {
    const n = await norteData()
    const paths = [
      '/users', '/users?role=COACH,ADMIN', '/classes', '/class-types', '/wods', '/plans',
      '/payments/history', '/payments/transfer/pending', '/payments/revenue',
      '/rms/gym-evolution', '/rms/gym-board', '/ai/retention-alerts', '/analytics/gym-stats',
      '/classes/attendance', '/gyms/me', '/payments/fintoc/movements', '/benchmarks/board',
    ]
    for (const path of paths) {
      const res = await api('adminSur', 'GET', path)
      expect(res.status, `GET ${path}`).toBeLessThan(500)
      expect(norteTraces(res.data, n), `GET ${path} trae datos de Norte`).toEqual([])
    }
    // Control positivo: sí ve lo suyo
    const users = (await api('adminSur', 'GET', '/users')).data
    expect(JSON.stringify(users)).toContain(sur.users.member.email)
  })

  test('SEC-01 (UI) el admin de Sur no ve alumnos, clases, WODs ni pagos de Norte', async ({ page }) => {
    const n = await norteData()
    await open(page, '/dashboard/users')
    await expect(page.locator('main').getByText(sur.users.member.name).first()).toBeVisible()
    expect(norteTraces(await page.locator('main').innerText(), n)).toEqual([])

    for (const path of ['/dashboard/payments', '/dashboard/classes', '/dashboard/wods', '/dashboard/evolution',
      '/dashboard/reports', '/dashboard/plans', '/dashboard/fintoc', '/dashboard/alerts', '/dashboard']) {
      await expectPageClean(page, path, n)
    }
  })

  test('SEC-02 (UI) el admin de Sur abre URLs de recursos de Norte → vuelve a la lista o queda vacío', async ({ page }) => {
    const n = await norteData()
    await page.goto(`/dashboard/users/${n.member.id}`)
    await expect(page).toHaveURL(/\/dashboard\/users$/, { timeout: 15_000 })
    await page.waitForLoadState('networkidle')
    expect(norteTraces(await page.locator('main').innerText(), n), 'ficha de alumno de Norte').toEqual([])

    await page.goto(`/dashboard/classes/${n.classIds[0]}`)
    await page.waitForLoadState('networkidle')
    expect(norteTraces(await page.locator('main').innerText(), n), 'detalle de clase de Norte').toEqual([])

    await page.goto(`/dashboard/wods/${n.wodIds[0]}/leaderboard`)
    await page.waitForLoadState('networkidle')
    expect(norteTraces(await page.locator('main').innerText(), n), 'leaderboard de WOD de Norte').toEqual([])
  })

  test('SEC-02 (API) el admin de Sur pide recursos de Norte por ID → 403/404 o vacío', async () => {
    const n = await norteData()
    const classId = n.classIds[0]
    const wodId = n.wodIds[0]
    const reads = [
      `/users/${n.member.id}`,
      `/classes/${classId}`,
      `/classes/${classId}/attendees`,
      `/wods/class/${classId}`,
      `/wods/${wodId}/leaderboard`,
      `/rms/user/${n.member.id}`,
      `/gymnastic-progress/user/${n.member.id}`,
    ]
    for (const path of reads) expectDenied(await api('adminSur', 'GET', path), n, `GET ${path}`)

    // Escrituras no-op (mismo valor): si el aislamiento fallara, no cambian nada
    const plan = norte.plans.mensual
    const planId = (await api('admin', 'GET', '/plans')).data.find((p: any) => p.name === plan.name).id
    const writes: [string, string, unknown][] = [
      ['PUT', `/users/${n.member.id}`, { name: n.member.name }],
      ['PUT', `/plans/${planId}`, { name: plan.name }],
    ]
    for (const [method, path, body] of writes) {
      const res = await api('adminSur', method, path, body)
      // PUT /plans/:id de otro gym responde 400 "Plan no encontrado" (debería ser 404, S4): lo
      // que importa para el aislamiento es que no se aplique
      expect([400, 403, 404], `${method} ${path} → ${res.status}`).toContain(res.status)
      expect(JSON.stringify(res.data)).not.toContain(n.gymId)
    }
    // Y Norte sigue igual
    const mara = (await api('admin', 'GET', `/users/${n.member.id}`)).data
    expect(mara.name).toBe(n.member.name)
  })
})

// ─── SEC-03: archivos de /uploads ─────────────────────────────────────────────

const FILES_BASE = API_URL.replace(/\/api$/, '')

function storedItem(role: Role, name: string): string | null {
  const file = authFile(role)
  if (!existsSync(file)) return null
  const state = JSON.parse(readFileSync(file, 'utf-8'))
  return state.origins?.[0]?.localStorage?.find((i: { name: string }) => i.name === name)?.value ?? null
}

const loginCache = new Map<Role, Awaited<ReturnType<typeof login>>>()
async function tokens(role: Role): Promise<{ access: string; media: string }> {
  const access = storedItem(role, 'fitapp_token')
  const media = storedItem(role, 'fitapp_media_token')
  if (access && media && secondsLeft(access) > 120 && secondsLeft(media) > 120) return { access, media }
  if (!loginCache.has(role)) loginCache.set(role, await login(role))
  const data = loginCache.get(role)!
  return { access: data.token, media: data.mediaToken! }
}

async function getFile(path: string, opts: { t?: string; bearer?: string } = {}) {
  const url = `${FILES_BASE}${path}${opts.t ? `?t=${encodeURIComponent(opts.t)}` : ''}`
  const res = await fetchRetry429(url, { headers: opts.bearer ? { Authorization: `Bearer ${opts.bearer}` } : {} })
  return { status: res.status, type: res.headers.get('content-type') ?? '' }
}

test.describe('SEC — archivos protegidos', () => {
  const RECEIPT = '/uploads/receipts/qa-receipt-member3.png'

  test('SEC-03 comprobante de transferencia: sin token, token de otro gym o token de acceso → rechazado; token de medios correcto → 200', async () => {
    const adminN = await tokens('admin')
    const adminS = await tokens('adminSur')
    const coachN = await tokens('coach')
    const memberN = await tokens('member') // alumna de Norte, pero no dueña de este comprobante

    const ok = await getFile(RECEIPT, { t: adminN.media })
    expect(ok.status, 'admin de Norte con su token de medios').toBe(200)
    expect(ok.type).toContain('image/png')

    const denied: [string, Awaited<ReturnType<typeof getFile>>][] = [
      ['sin token', await getFile(RECEIPT)],
      ['token de medios del admin de Sur', await getFile(RECEIPT, { t: adminS.media })],
      ['token de acceso (no de medios) en ?t=', await getFile(RECEIPT, { t: adminN.access })],
      ['token de medios de un coach de Norte', await getFile(RECEIPT, { t: coachN.media })],
      ['token de medios de otra alumna de Norte', await getFile(RECEIPT, { t: memberN.media })],
      ['token inválido', await getFile(RECEIPT, { t: 'x.y.z' })],
    ]
    for (const [what, res] of denied) expect([401, 403, 404], `${what} → ${res.status}`).toContain(res.status)
    // Sin token y con token que no es de medios: 401 explícito
    expect(denied[0][1].status).toBe(401)
    expect(denied[2][1].status).toBe(401)
  })

  test('SEC-03 avatar: sin token, token de otro gym o token de acceso → rechazado; token de medios del gym → 200', async () => {
    const adminN = await tokens('admin')
    const adminS = await tokens('adminSur')
    const memberN = await tokens('member')

    // Avatar para Mateo Riesgo (no lo usan otros specs): lo sube el admin de Norte
    const users = (await api('admin', 'GET', '/users')).data as any[]
    const target = users.find(u => u.email === norte.users.member2.email)
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')
    const form = new FormData()
    form.append('file', new Blob([png], { type: 'image/png' }), 'avatar.png')
    const upload = await fetchRetry429(`${API_URL}/users/${target.id}/avatar`, { method: 'POST', headers: { Authorization: `Bearer ${adminN.access}` }, body: form })
    expect(upload.status, await upload.clone().text()).toBe(200)
    const avatarUrl = (await upload.json()).avatarUrl as string
    expect(avatarUrl).toMatch(/^\/uploads\/avatars\/avatar_[0-9a-f-]+\.png$/)

    const ok = await getFile(avatarUrl, { t: adminN.media })
    expect(ok.status, 'admin de Norte con su token de medios').toBe(200)
    expect(ok.type).toContain('image/png')
    expect((await getFile(avatarUrl, { t: memberN.media })).status, 'alumna del mismo gym').toBe(200)

    const denied: [string, Awaited<ReturnType<typeof getFile>>][] = [
      ['sin token', await getFile(avatarUrl)],
      ['token de medios del admin de Sur', await getFile(avatarUrl, { t: adminS.media })],
      ['token de acceso (no de medios) en ?t=', await getFile(avatarUrl, { t: adminN.access })],
    ]
    for (const [what, res] of denied) expect([401, 403, 404], `${what} → ${res.status}`).toContain(res.status)
    expect(denied[0][1].status).toBe(401)
    expect(denied[2][1].status).toBe(401)
  })

  test('SEC-03 el token de medios no sirve como token de acceso a la API', async () => {
    const { media } = await tokens('admin')
    for (const path of ['/users', '/gyms/me', '/payments/history']) {
      const res = await fetch(`${API_URL}${path}`, { headers: { Authorization: `Bearer ${media}` } })
      expect([401, 429], `GET ${path} con token de medios → ${res.status}`).toContain(res.status)
      expect(res.status).not.toBe(200)
    }
  })

  test('SEC-06 path traversal en /uploads no sale del directorio', async () => {
    const { media } = await tokens('admin')
    for (const path of ['/uploads/..%2F.env', '/uploads/receipts/..%2F..%2F.env', '/uploads/avatars/..%2F..%2Fpackage.json',
      '/uploads/assets/..%2F..%2F.env', '/uploads/%2e%2e%2f%2e%2e%2fpackage.json']) {
      const res = await getFile(path, { t: media })
      expect([400, 401, 403, 404], `${path} → ${res.status}`).toContain(res.status)
    }
  })

  // El logo animado del login se sirve desde la API en un <iframe> (page.tsx). Sin
  // frame-src en la CSP, default-src 'self' lo bloquea y el logo nunca aparece.
  test('SEC-07 la CSP de /login permite enmarcar el logo animado servido por la API', async ({ page }) => {
    const res = await page.goto('/login')
    const csp = res?.headers()['content-security-policy'] ?? ''
    expect(csp).toContain('frame-src')
    const apiOrigin = new URL(API_URL).origin
    expect(csp.match(/frame-src[^;]*/)?.[0]).toContain(apiOrigin)
  })
})
