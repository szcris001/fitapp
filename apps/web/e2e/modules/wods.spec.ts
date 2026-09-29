/**
 * WOD — Pizarra (listado, importación por Excel y leaderboard)
 * Casos en docs/TESTING_STRATEGY.md §4.
 *
 * WOD-01/WOD-06 solo leen los WOD sembrados (CrossFit ayer, hoy y mañana). Lo que se crea
 * (importaciones, WOD del leaderboard) usa un tipo de clase propio «E2E-WOD … <run>» y
 * fechas lejanas únicas por corrida; afterAll borra todo lo que tenga ese prefijo.
 */
import { test, expect } from '@playwright/test'
import * as XLSX from 'xlsx'
import { tmpdir } from 'os'
import { join } from 'path'
import { QA, api, authFile, open, type Role } from '../support/qa'

const TZ = 'America/Santiago'
const RUN = Date.now().toString(36)
const PREFIX = 'E2E-WOD'
const NORTE = QA.gyms.norte.users

/** Fecha local 'YYYY-MM-DD' a `offset` días de hoy en la zona del gym */
function localDay(offset = 0): string {
  const today = new Date().toLocaleDateString('sv', { timeZone: TZ })
  const [y, m, d] = today.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + offset)).toISOString().slice(0, 10)
}

/** Día local de un instante */
const localDate = (instant: string) => new Date(instant).toLocaleDateString('sv', { timeZone: TZ })

/** Etiqueta de fecha como la muestra el listado (es-CL, «mar, 29 sept») */
const listLabel = (day: string) =>
  new Date(`${day}T12:00:00Z`).toLocaleDateString('es-CL', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })

type Wod = { id: string; title: string | null; date: string; classTypeId: string; scoreType: string; blocks: { title: string | null; movements: unknown[] }[] }

async function wodsOf(classTypeId: string, from: string, to: string): Promise<Wod[]> {
  const { data } = await api('admin', 'GET', `/wods?from=${from}&to=${to}`)
  return (data as Wod[]).filter(w => w.classTypeId === classTypeId)
}

async function createClassType(name: string) {
  const { status, data } = await api('admin', 'POST', '/class-types', { name, color: '#14b8a6', discipline: 'crossfit' })
  expect(status, JSON.stringify(data)).toBe(201)
  return data as { id: string; name: string }
}

test.afterAll(async () => {
  test.setTimeout(60_000)
  const from = localDay(-2)
  const to = localDay(460)
  const { data: types } = await api('admin', 'GET', '/class-types')
  const { data: wods } = await api('admin', 'GET', `/wods?from=${from}&to=${to}`)
  const { data: classes } = await api('admin', 'GET', `/classes?from=${from}&to=${to}`)
  for (const type of (types as { id: string; name: string }[]).filter(t => t.name.startsWith(`${PREFIX} `))) {
    for (const w of (wods as Wod[]).filter(w => w.classTypeId === type.id)) await api('admin', 'DELETE', `/wods/${w.id}`)
    const ids = (classes as { id: string; classTypeId: string }[]).filter(c => c.classTypeId === type.id).map(c => c.id)
    if (ids.length) await api('admin', 'DELETE', '/classes/bulk', { ids })
    await api('admin', 'DELETE', `/class-types/${type.id}`)
  }
})

// ─── WOD-01 / WOD-06 · listado (coach) ────────────────────────────────────────

test.describe('WOD — listado (coach)', () => {
  test.use({ storageState: authFile('coach') })

  const rows = (page: import('@playwright/test').Page) =>
    page.locator('.card button').filter({ hasText: /bloques ·/ })

  test('WOD-01 listado con filtros de fecha y tipo de clase', async ({ page }) => {
    const [ayer, hoy, manana] = [localDay(-1), localDay(0), localDay(1)]
    const p = await open(page, '/dashboard/wods')
    await expect(page.getByRole('heading', { name: 'Pizarra' })).toBeVisible()
    const [desde, hasta] = [page.getByLabel('Desde'), page.getByLabel('Hasta')]
    const tipo = page.getByLabel('Tipo de clase')

    // Rango ayer → mañana, solo CrossFit: los tres WOD sembrados, en su día local
    await hasta.fill(manana)
    await desde.fill(ayer)
    await tipo.selectOption({ label: 'CrossFit' })
    for (const [title, day] of [['QA WOD Ayer', ayer], ['QA WOD Hoy', hoy], ['QA WOD Mañana', manana]]) {
      const row = rows(page).filter({ hasText: title })
      await expect(row, title).toHaveCount(1)
      await expect(row, title).toContainText(listLabel(day))
      await expect(row, title).toContainText('CrossFit')
    }
    await expect(rows(page).filter({ hasText: 'QA WOD Hoy' })).toContainText('2 bloques · 3 movimientos')

    // Solo hoy
    await desde.fill(hoy)
    await hasta.fill(hoy)
    await expect(rows(page)).toHaveCount(1)
    await expect(rows(page).first()).toContainText('QA WOD Hoy')

    // Halterofilia no tiene WOD sembrado
    await hasta.fill(manana)
    await desde.fill(ayer)
    await tipo.selectOption({ label: 'Halterofilia' })
    await expect(page.getByText('No hay WODs en este rango')).toBeVisible()
    await expect(rows(page)).toHaveCount(0)

    // «Todos» vuelve a mostrar los de CrossFit
    await tipo.selectOption({ label: 'Todos' })
    await expect(rows(page).filter({ hasText: /QA WOD (Ayer|Hoy|Mañana)/ })).toHaveCount(3)
    p.expectNoErrors()
  })

  // BUG: openWod (apps/web/app/dashboard/wods/page.tsx ~L103) pide /classes?from=<día>&to=<día> y la API
  // interpreta esas fechas como días UTC (classes.service.ts listClasses: new Date(from), setUTCHours(23,59,59)).
  // En Chile el rango arranca a las 21:00 del día anterior, así que se abre la clase de ayer 21:00 (con el
  // WOD de ayer) en vez de una clase del día del WOD.
  test('WOD-06 clic en un WOD del listado abre una clase de ese día con ese WOD', async ({ page }) => {
    const hoy = localDay(0)
    const p = await open(page, '/dashboard/wods')
    await page.getByLabel('Hasta').fill(hoy)
    await page.getByLabel('Desde').fill(hoy)
    await page.getByLabel('Tipo de clase').selectOption({ label: 'CrossFit' })
    await rows(page).filter({ hasText: 'QA WOD Hoy' }).click()

    await expect(page).toHaveURL(/\/dashboard\/classes\/[0-9a-f-]{36}$/)
    const classId = page.url().split('/').pop()!
    const { data: cls } = await api('coach', 'GET', `/classes/${classId}`)
    expect(localDate(cls.startsAt)).toBe(hoy)
    await expect(page.getByRole('heading', { name: 'WOD — QA WOD Hoy' })).toBeVisible()
    p.expectNoErrors()
  })
})

// ─── WOD-02 / WOD-03 · importar Excel (admin) ─────────────────────────────────

test.describe('WOD — importar Excel (admin)', () => {
  test.describe.configure({ mode: 'serial' })

  // Dos días lejanos y únicos por corrida; el tipo de clase también es propio
  const base = 200 + (Math.floor(Date.now() / 1000) % 150)
  const day1 = localDay(base)
  const day2 = localDay(base + 1)
  const file = join(tmpdir(), `e2e-wods-${RUN}.xlsx`)
  let typeId = ''
  let typeName = ''

  test.beforeAll(async () => {
    const type = await createClassType(`${PREFIX} Import ${RUN}`)
    typeId = type.id
    typeName = type.name
    // Mismas columnas que la plantilla descargable (wods/import/page.tsx downloadTemplate)
    const headers = ['fecha', 'tipo_clase', 'titulo_wod', 'bloque', 'timecap',
      'movimiento1', 'reps1', 'rx1(H/M)', 'scale1(H/M)', 'rookie1(H/M)', 'notas1',
      'movimiento2', 'reps2', 'rx2(H/M)', 'scale2(H/M)', 'rookie2(H/M)', 'notas2']
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      headers,
      [day1, typeName, `E2E Import A ${RUN}`, 'Fuerza', '20min',
        'Back Squat', '5-5-5', '130/90', '100/70', '80/55', 'Pausa 2seg', 'Romanian Deadlift', '4x8', '80/55', '', '', ''],
      [day1, typeName, '', 'Metcon', 'For Time',
        'Squat Snatch', '9-7-5', '90-80-70/66-58-52', '', '', '', 'Pull-up', '21-15-9', '', '', '', ''],
      [day2, typeName, `E2E Import B ${RUN}`, 'Técnica', '15min',
        'Power Clean', '3x3', '80/55', '65/45', '50/35', '', '', '', '', '', '', ''],
    ]), 'WODs')
    XLSX.writeFile(wb, file)
  })

  test('WOD-02 importar Excel de plantilla → crea WODs', async ({ page }) => {
    const p = await open(page, '/dashboard/wods/import')
    await page.locator('input[type="file"]').setInputFiles(file)
    await expect(page.getByRole('heading', { name: /Vista previa — 3 bloques → 2 WODs/ })).toBeVisible()
    await expect(page.getByText('3 bloques OK')).toBeVisible()
    await page.getByRole('button', { name: 'Importar 2 WODs' }).click()
    await expect(page.getByText('Importación completada')).toBeVisible()
    await expect(page.getByText('2 WODs importados correctamente')).toBeVisible()

    const wods = await wodsOf(typeId, day1, day2)
    expect(wods).toHaveLength(2)
    const a = wods.find(w => localDate(w.date) === day1)
    const b = wods.find(w => localDate(w.date) === day2)
    expect(a?.title).toBe(`E2E Import A ${RUN}`)
    expect(a?.blocks.map(bl => bl.title)).toEqual(['Fuerza', 'Metcon'])
    expect(a?.blocks.map(bl => bl.movements.length)).toEqual([2, 2])
    expect(b?.title).toBe(`E2E Import B ${RUN}`)
    expect(b?.blocks).toHaveLength(1)

    // Aparecen en la Pizarra con su fecha
    await open(page, '/dashboard/wods')
    await page.getByLabel('Hasta').fill(day2)
    await page.getByLabel('Desde').fill(day1)
    await page.getByLabel('Tipo de clase').selectOption({ label: typeName })
    await expect(page.locator('.card button').filter({ hasText: `E2E Import A ${RUN}` })).toContainText(listLabel(day1))
    await expect(page.locator('.card button').filter({ hasText: `E2E Import B ${RUN}` })).toContainText(listLabel(day2))
    p.expectNoErrors()
  })

  test('WOD-03 reimportar el mismo archivo → 0 creados y aviso de duplicado', async ({ page }) => {
    const p = await open(page, '/dashboard/wods/import')
    await page.locator('input[type="file"]').setInputFiles(file)
    await page.getByRole('button', { name: 'Importar 2 WODs' }).click()
    await expect(page.getByText('Importación completada')).toBeVisible()
    await expect(page.getByText('0 WODs importados correctamente')).toBeVisible()
    await expect(page.getByText(`Ya existe un WOD para ${typeName} el ${day1}`)).toBeVisible()
    await expect(page.getByText(`Ya existe un WOD para ${typeName} el ${day2}`)).toBeVisible()
    expect(await wodsOf(typeId, day1, day2)).toHaveLength(2)
    p.expectNoErrors()
  })
})

// ─── WOD-04 · leaderboard (coach) ─────────────────────────────────────────────

test.describe('WOD — leaderboard (coach)', () => {
  test.use({ storageState: authFile('coach') })

  // BUG: RegisterModal (apps/web/app/dashboard/wods/[id]/leaderboard/page.tsx ~L100) envía
  // { score: '4:10' (string), isRx } pero POST /wods/:id/results (apps/api/src/modules/wod/wod.routes.ts ~L221)
  // espera { score: number, rx: boolean } sin validar: Prisma rechaza el string y `isRx` se ignora
  // (rx queda en su default true). No se puede registrar un resultado desde la web.
  test('WOD-04 leaderboard: registrar resultado de un alumno y verlo ordenado', async ({ page }) => {
    // WOD propio (TIME) dentro de los próximos 60 días: el leaderboard busca el título en ese rango
    const type = await createClassType(`${PREFIX} Leaderboard ${RUN}`)
    const day = localDay(20 + (Math.floor(Date.now() / 1000) % 30))
    const title = `E2E Leaderboard ${RUN}`
    const { status, data: wod } = await api('admin', 'POST', '/wods', {
      classTypeId: type.id, title, date: day, scoreType: 'TIME',
      blocks: [{ title: 'Metcon', movements: [{ movementName: 'Thruster', repScheme: '21-15-9' }] }],
    })
    expect(status, JSON.stringify(wod)).toBe(201)
    // Resultado previo por API (formato que acepta la API): Mara, RX, 5:00
    const { data: members } = await api('admin', 'GET', '/users?role=MEMBER')
    const idOf = (email: string) => (members as { id: string; email: string }[]).find(m => m.email === email)!.id
    const pre = await api('admin', 'POST', `/wods/${wod.id}/results`, { userId: idOf(NORTE.member.email), score: 300, rx: true })
    expect(pre.status).toBe(201)

    const p = await open(page, `/dashboard/wods/${wod.id}/leaderboard`)
    await expect(page.getByRole('heading', { name: title })).toBeVisible()
    await expect(page.getByText(/Tiempo\s*— Menor es mejor/)).toBeVisible()

    const register = async (name: string, score: string, category: 'RX' | 'Scaled') => {
      await page.getByRole('button', { name: 'Registrar resultado' }).click()
      await page.getByPlaceholder('Buscar atleta...').fill(name.split(' ')[0])
      await page.getByRole('button', { name: new RegExp(name) }).click()
      await page.getByPlaceholder('Ej: 3:45 o 225 (segundos)').fill(score)
      await page.getByRole('button', { name: new RegExp(`^${category}`) }).click()
      await page.getByRole('button', { name: 'Guardar resultado' }).click()
      // El modal se cierra solo si la API aceptó el resultado
      await expect(page.getByRole('heading', { name: 'Registrar resultado' })).toHaveCount(0)
    }

    // Mateo hace 4:10 RX (mejor que Mara) y Tomás 6:00 Scaled
    await register(NORTE.member2.name, '4:10', 'RX')
    await register(NORTE.member3.name, '6:00', 'Scaled')

    const column = (title: string) => page.locator('.card').filter({ has: page.getByText(title, { exact: true }) })
    const rx = column('RX')
    await expect(rx.getByText('2 atletas')).toBeVisible()
    const rxRows = rx.locator('div.border-b').filter({ has: page.locator('p.font-medium') })
    await expect(rxRows.nth(0)).toContainText(NORTE.member2.name)
    await expect(rxRows.nth(0)).toContainText('4:10')
    await expect(rxRows.nth(1)).toContainText(NORTE.member.name)
    await expect(rxRows.nth(1)).toContainText('5:00')
    const scaled = column('Scaled')
    await expect(scaled).toContainText(NORTE.member3.name)
    await expect(scaled).toContainText('6:00')

    // La API ordena igual (TIME: menor primero)
    const { data: lb } = await api('coach', 'GET', `/wods/${wod.id}/leaderboard`)
    const rxNames = (lb.entries as { rx: boolean; user: { name: string } }[]).filter(e => e.rx).map(e => e.user.name)
    expect(rxNames).toEqual([NORTE.member2.name, NORTE.member.name])
    p.expectNoErrors()
  })
})
