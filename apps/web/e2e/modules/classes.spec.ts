/**
 * CLS — Clases y tipos de clase
 * Casos en docs/TESTING_STRATEGY.md §4.
 *
 * Lo que un test modifica lo crea él mismo: un tipo de clase propio por corrida
 * («E2E-CLS … <run>») y clases/WOD en fechas lejanas. Así no se tocan las clases ni el
 * WOD sembrados (otros specs los leen). afterAll borra lo creado.
 */
import { test, expect, type Page } from '@playwright/test'
import * as XLSX from 'xlsx'
import { tmpdir } from 'os'
import { join } from 'path'
import { QA, api, authFile, open, type Role } from '../support/qa'

const TZ = 'America/Santiago'
const RUN = Date.now().toString(36)
/** Prefijo de todo lo que crea este spec: afterAll borra cualquier tipo con él (incluso de corridas abortadas) */
const PREFIX = 'E2E-CLS'
const NORTE = QA.gyms.norte.users

// ─── Fechas en la zona del gym ────────────────────────────────────────────────

/** Fecha local 'YYYY-MM-DD' a `offset` días de hoy */
function localDay(offset = 0): string {
  const today = new Date().toLocaleDateString('sv', { timeZone: TZ })
  const [y, m, d] = today.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + offset)).toISOString().slice(0, 10)
}

/** Instante de la hora local `hhmm` del día local `day` */
function atLocal(day: string, hhmm: string): Date {
  const [y, m, d] = day.split('-').map(Number)
  const [h, mi] = hhmm.split(':').map(Number)
  const wanted = Date.UTC(y, m - 1, d, h, mi)
  let t = wanted + 3 * 3_600_000
  for (let i = 0; i < 3; i++) {
    const { day: ld, time: lt } = local(new Date(t))
    const [ly, lm, ldd] = ld.split('-').map(Number)
    const [lh, lmi] = lt.split(':').map(Number)
    t += wanted - Date.UTC(ly, lm - 1, ldd, lh, lmi)
  }
  return new Date(t)
}

/** Día y hora locales ('YYYY-MM-DD', 'HH:MM') de un instante */
function local(instant: Date | string): { day: string; time: string } {
  const [day, time] = new Date(instant).toLocaleString('sv', { timeZone: TZ }).split(' ')
  return { day, time: time.slice(0, 5) }
}

/** Día de la semana (0=domingo) de una fecha local */
const weekday = (day: string) => new Date(`${day}T12:00:00Z`).getUTCDay()

/** Offset lejano y distinto por corrida (+200..+399 días) */
const farOffset = (salt = 0) => 200 + ((Math.floor(Date.now() / 1000) + salt) % 200)

// ─── Datos propios del spec ───────────────────────────────────────────────────

async function createClassType(name: string, discipline = 'crossfit') {
  const { status, data } = await api('admin', 'POST', '/class-types', { name, color: '#0ea5e9', discipline })
  expect(status, JSON.stringify(data)).toBe(201)
  return data as { id: string; name: string }
}

async function userId(email: string, role = 'MEMBER'): Promise<string> {
  const { data } = await api('admin', 'GET', `/users?role=${role}`)
  const u = (data as { id: string; email: string }[]).find(x => x.email === email)
  if (!u) throw new Error(`usuario ${email} no encontrado`)
  return u.id
}

async function createClass(classTypeId: string, day: string, start: string, end: string, capacity = 10) {
  const coachId = await userId(NORTE.coach.email, 'COACH,ADMIN')
  const { status, data } = await api('admin', 'POST', '/classes', {
    classTypeId, coachId, capacity, frequency: 'ONCE',
    startsAt: atLocal(day, start).toISOString(), endsAt: atLocal(day, end).toISOString(),
  })
  expect(status, JSON.stringify(data)).toBe(201)
  return data as { id: string; startsAt: string }
}

async function classesOf(classTypeId: string, from: string, to: string) {
  const { data } = await api('admin', 'GET', `/classes?from=${from}&to=${to}`)
  return (data as { id: string; classTypeId: string; startsAt: string; endsAt: string }[])
    .filter(c => c.classTypeId === classTypeId)
}

// Tipos (y sus clases/WOD) creados por este spec; los de corridas abortadas también
test.afterAll(async () => {
  test.setTimeout(60_000)
  const from = localDay(-2)
  const to = localDay(460)
  const { data: types } = await api('admin', 'GET', '/class-types')
  const { data: wods } = await api('admin', 'GET', `/wods?from=${from}&to=${to}`)
  for (const type of (types as { id: string; name: string }[]).filter(t => t.name.startsWith(`${PREFIX} `))) {
    for (const w of (wods as { id: string; classTypeId: string }[]).filter(w => w.classTypeId === type.id)) {
      await api('admin', 'DELETE', `/wods/${w.id}`)
    }
    const ids = (await classesOf(type.id, from, to)).map(c => c.id)
    if (ids.length) await api('admin', 'DELETE', '/classes/bulk', { ids })
    await api('admin', 'DELETE', `/class-types/${type.id}`)
  }
})

// ─── CLS-01 · calendario ──────────────────────────────────────────────────────

test.describe('CLS — calendario (admin)', () => {
  test('CLS-01 calendario de hoy muestra las clases de 07:00, 18:00, 19:00 y 21:00 en hora local', async ({ page }) => {
    const p = await open(page, '/dashboard/classes')
    await page.getByRole('button', { name: 'Día', exact: true }).click()
    await page.waitForLoadState('networkidle')

    const events = page.locator('.fc-timegrid-event')
    const at = (hour: number, type: string) =>
      events.filter({ hasText: new RegExp(`^0?${hour}:00\\D.*${type}`) })

    await expect(at(7, 'CrossFit').first()).toBeVisible()
    await expect(at(18, 'Halterofilia').first()).toBeVisible()
    await expect(at(19, 'CrossFit').first()).toBeVisible()
    await expect(at(21, 'CrossFit').first()).toBeAttached()
    // Si la hora se mostrara en UTC aparecerían a las 10/11, 22/23 o 0/1
    for (const wrong of [10, 11, 22, 23]) await expect(at(wrong, 'CrossFit')).toHaveCount(0)
    p.expectNoErrors()
  })
})

// ─── CLS-02 · crear clase única y recurrente ──────────────────────────────────

/** Abre «Nueva clase», elige tipo y coach y avanza `weeks` semanas */
async function openNewClass(page: Page, typeName: string, weeks: number) {
  await open(page, '/dashboard/classes/new')
  const selects = page.locator('select')
  await expect(selects.first().locator('option', { hasText: typeName })).toHaveCount(1)
  await selects.nth(0).selectOption({ label: typeName })
  await selects.nth(1).selectOption({ label: NORTE.coach.name })
  const daysCard = page.locator('.card').filter({ hasText: 'Días de la semana' })
  for (let i = 0; i < weeks; i++) await daysCard.getByRole('button').nth(1).click()
  return daysCard
}

/** Lunes local de la semana que está `weeks` semanas después de la actual */
function mondayIn(weeks: number): string {
  const today = localDay(0)
  const dow = weekday(today)
  return localDay(-((dow + 6) % 7) + weeks * 7)
}

const addDays = (day: string, n: number) => {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10)
}

test.describe('CLS — crear clases (admin)', () => {
  test('CLS-02a crear clase única (un día, sin repetir) → 1 clase a la hora local elegida', async ({ page }) => {
    const type = await createClassType(`${PREFIX} Única ${RUN}`)
    const weeks = 4
    const monday = mondayIn(weeks)
    const wednesday = addDays(monday, 2)

    const daysCard = await openNewClass(page, type.name, weeks)
    await daysCard.getByRole('button').filter({ hasText: 'Mié' }).click()
    await page.locator('input[type="time"]').nth(0).fill('07:00')
    await page.locator('input[type="time"]').nth(1).fill('08:00')
    await page.locator('input[type="date"]').fill(wednesday)
    await page.getByRole('button', { name: /^Crear ~\d+ clases$/ }).click()
    await expect(page.getByText(/^1 clases? creadas?/)).toBeVisible()

    const created = await classesOf(type.id, monday, addDays(monday, 6))
    expect(created).toHaveLength(1)
    expect(local(created[0].startsAt)).toEqual({ day: wednesday, time: '07:00' })
    expect(local(created[0].endsAt)).toEqual({ day: wednesday, time: '08:00' })
  })

  // BUG: createClass (apps/api/src/modules/classes/classes.service.ts ~L170-178) elige los días con
  // getUTCDay() del instante. Una clase de 21:30 en Chile (UTC-3) es 00:30 UTC del día siguiente,
  // así que «Lunes y Jueves 21:30» se crea Martes/Viernes (o Domingo/Miércoles) 21:30.
  test('CLS-02b crear clase recurrente Lun+Jue 21:30 por 2 semanas → 4 clases en esos días locales', async ({ page }) => {
    const type = await createClassType(`${PREFIX} Recurrente ${RUN}`)
    const weeks = 5
    const monday = mondayIn(weeks)
    const until = addDays(monday, 13)

    const daysCard = await openNewClass(page, type.name, weeks)
    await daysCard.getByRole('button').filter({ hasText: 'Lun' }).click()
    await daysCard.getByRole('button').filter({ hasText: 'Jue' }).click()
    await page.locator('input[type="time"]').nth(0).fill('21:30')
    await page.locator('input[type="time"]').nth(1).fill('22:30')
    await page.locator('input[type="date"]').fill(until)
    await page.getByRole('button', { name: /^Crear ~\d+ clases$/ }).click()
    await expect(page.getByText(/clases creadas exitosamente/)).toBeVisible()

    const created = await classesOf(type.id, addDays(monday, -2), addDays(until, 2))
    const slots = created.map(c => local(c.startsAt)).sort((a, b) => a.day.localeCompare(b.day))
    expect(slots).toEqual([
      { day: monday, time: '21:30' },
      { day: addDays(monday, 3), time: '21:30' },
      { day: addDays(monday, 7), time: '21:30' },
      { day: addDays(monday, 10), time: '21:30' },
    ])
  })
})

test.describe('CLS — crear clase con el navegador en otra zona horaria (admin)', () => {
  // El bug (ClassDetail.tsx fmtTime, new/page.tsx, import/page.tsx) solo se nota con el
  // navegador en una zona distinta a Chile — en local/CI, siempre en America/Santiago,
  // nunca lo habría atrapado. Forzamos UTC acá; local() sigue leyendo en America/Santiago
  // (corre en el proceso de Node del test, no en el navegador, así que no se ve afectado).
  test.use({ timezoneId: 'UTC' })

  test('CLS-11 crear clase con navegador en UTC → la hora guardada es la de Chile, no la de UTC', async ({ page }) => {
    const type = await createClassType(`${PREFIX} TZ ${RUN}`)
    const weeks = 6
    const monday = mondayIn(weeks)
    const thursday = addDays(monday, 3)

    const daysCard = await openNewClass(page, type.name, weeks)
    await daysCard.getByRole('button').filter({ hasText: 'Jue' }).click()
    await page.locator('input[type="time"]').nth(0).fill('14:00')
    await page.locator('input[type="time"]').nth(1).fill('15:00')
    await page.locator('input[type="date"]').fill(thursday)
    await page.getByRole('button', { name: /^Crear ~\d+ clases$/ }).click()
    await expect(page.getByText(/^1 clases? creadas?/)).toBeVisible()

    const created = await classesOf(type.id, monday, addDays(monday, 6))
    expect(created).toHaveLength(1)
    // Si el bug estuviera de vuelta, esto leería 11:00 (14:00 UTC interpretado como si
    // fuera hora de Chile al revés) en vez de 14:00.
    expect(local(created[0].startsAt)).toEqual({ day: thursday, time: '14:00' })
    expect(local(created[0].endsAt)).toEqual({ day: thursday, time: '15:00' })
  })
})

// ─── CLS-03 / CLS-07 · detalle de clase ───────────────────────────────────────

test.describe('CLS — detalle de clase (admin)', () => {
  test('CLS-03 detalle de clase: crear y editar WOD con puntaje TIME → persiste', async ({ page }) => {
    const type = await createClassType(`${PREFIX} WOD Detalle ${RUN}`)
    const day = localDay(farOffset(1))
    const cls = await createClass(type.id, day, '21:30', '22:30')
    const title = `E2E Fran ${RUN}`

    const p = await open(page, `/dashboard/classes/${cls.id}`)
    // Fecha y hora locales del gym (la clase es 00:30 UTC del día siguiente)
    const expectedDate = new Date(`${day}T12:00:00Z`).toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })
    await expect(page.getByText(expectedDate, { exact: true }).first()).toBeVisible()
    await expect(page.getByText(/(21:30|09:30\s*p\.\s*m\.)\s*–\s*(22:30|10:30\s*p\.\s*m\.)/)).toBeVisible()

    await page.getByRole('button', { name: /Sin planificación/ }).click()
    await expect(page.getByRole('heading', { name: 'Nueva planificación' })).toBeVisible()
    await page.getByPlaceholder('Ej. Fran, AMRAP 20, For Time, Día de fuerza...').fill(title)
    await page.getByRole('button', { name: /Tiempo$/ }).click()
    // Movimientos por «Entrada rápida» (el selector de movimientos se prueba aparte en CLS-09)
    await page.getByRole('button', { name: 'Entrada rápida' }).click()
    await page.getByPlaceholder('Pega o escribe aquí los movimientos...').fill('A) Metcon\nFOR TIME\nThruster 21-15-9 43/30kg')
    await page.getByRole('button', { name: 'Parsear y cargar' }).click()
    await expect(page.getByPlaceholder('A) WOD / B) STRENGTH / Warmup...')).toHaveValue('Metcon')
    await page.getByRole('button', { name: 'Crear planificación' }).click()

    await expect(page.getByRole('heading', { name: `WOD — ${title}` })).toBeVisible()
    await page.reload()
    await expect(page.getByRole('heading', { name: `WOD — ${title}` })).toBeVisible()
    await expect(page.getByText('Thruster', { exact: true })).toBeVisible()
    await expect(page.getByText('21-15-9', { exact: true })).toBeVisible()

    // Persistido con el tipo de puntaje y en el día local de la clase
    const wodOf = async () => {
      const { data } = await api('admin', 'GET', `/wods?from=${day}&to=${day}`)
      return (data as { id: string; classTypeId: string; title: string; scoreType: string; date: string }[])
        .find(w => w.classTypeId === type.id)
    }
    let wod = await wodOf()
    expect(wod?.scoreType).toBe('TIME')
    expect(wod?.title).toBe(title)
    expect(local(wod!.date).day).toBe(day)

    // Editar: cambia el título y conserva TIME
    await page.getByTitle('Editar WOD').click()
    await expect(page.getByRole('heading', { name: 'Editar planificación' })).toBeVisible()
    await page.getByPlaceholder('Ej. Fran, AMRAP 20, For Time, Día de fuerza...').fill(`${title} v2`)
    await page.getByRole('button', { name: 'Guardar cambios' }).click()
    await expect(page.getByRole('heading', { name: `WOD — ${title} v2` })).toBeVisible()
    await page.reload()
    await expect(page.getByRole('heading', { name: `WOD — ${title} v2` })).toBeVisible()
    wod = await wodOf()
    expect(wod?.scoreType).toBe('TIME')
    expect(wod?.title).toBe(`${title} v2`)
    p.expectNoErrors()
  })

  // BUG: handleSaveEdit (apps/web/app/dashboard/classes/_components/ClassDetail.tsx ~L1050) toma el día
  // con toISOString() (UTC). Para una clase de 21:00 o más tarde en Chile ese día UTC es el siguiente,
  // así que guardar la clase (aunque solo cambie la capacidad) la mueve al día siguiente.
  test('CLS-07 editar la capacidad de una clase de 21:30 no le cambia el día ni la hora', async ({ page }) => {
    const type = await createClassType(`${PREFIX} Editar ${RUN}`)
    const day = localDay(farOffset(2))
    const cls = await createClass(type.id, day, '21:30', '22:30', 10)

    const p = await open(page, `/dashboard/classes/${cls.id}`)
    await page.getByTitle('Editar clase').click()
    await expect(page.getByRole('heading', { name: 'Editar clase' })).toBeVisible()
    await page.locator('input[type="number"]').fill('12')
    await page.getByRole('button', { name: 'Guardar cambios' }).click()
    await expect(page.getByRole('heading', { name: type.name })).toBeVisible()

    const { data } = await api('admin', 'GET', `/classes/${cls.id}`)
    expect(data.capacity).toBe(12)
    expect(local(data.startsAt)).toEqual({ day, time: '21:30' })
    expect(local(data.endsAt)).toEqual({ day, time: '22:30' })
    p.expectNoErrors()
  })
  // BUG: en el editor de WOD (ClassDetail.tsx, MovementPicker ~L34 dentro del bloque con `overflow-hidden`
  // ~L679) la lista de sugerencias es `absolute` y queda recortada por el contenedor del bloque: con la
  // ventana de 1280×720 la opción no se puede clickear y el movimiento nunca se asigna (el picker solo
  // llama a onChange al elegir una opción, así que escribir el nombre no basta).
  test('CLS-09 editor de WOD: elegir un movimiento de la lista de sugerencias', async ({ page }) => {
    const type = await createClassType(`${PREFIX} Picker ${RUN}`)
    const cls = await createClass(type.id, localDay(farOffset(4)), '07:00', '08:00')
    const p = await open(page, `/dashboard/classes/${cls.id}`)
    await page.getByRole('button', { name: /Sin planificación/ }).click()
    const picker = page.getByPlaceholder('Escribe para buscar movimiento...').first()
    await picker.fill('Thrus')
    await page.getByRole('button', { name: 'Thruster', exact: true }).click({ timeout: 5_000 })
    await expect(picker).toHaveValue('Thruster')
    await expect(page.getByText('1 movimientos')).toBeVisible()
    p.expectNoErrors()
  })

  test('CLS-10 editar WOD sin tocar un movimiento con sets×reps sembrados conserva el multiplicador', async ({ page }) => {
    const type = await createClassType(`${PREFIX} WOD SetsReps ${RUN}`)
    const day = localDay(farOffset(5))
    const cls = await createClass(type.id, day, '18:00', '19:00')
    const title = `E2E SetsReps ${RUN}`

    // Movimiento sembrado con sets/reps estructurados (como hace seed-qa.ts), sin repScheme —
    // el editor de WOD nunca escribe estos campos, solo los lee al inicializar el formulario.
    const { status } = await api('admin', 'POST', '/wods', {
      classTypeId: type.id,
      title,
      date: day,
      scoreType: 'REPS',
      blocks: [{ title: 'Fuerza', movements: [{ movementName: 'Back Squat', sets: 5, reps: 5, percentage: 75 }] }],
    })
    expect(status).toBe(201)

    const p = await open(page, `/dashboard/classes/${cls.id}`)
    await expect(page.getByText('5×5', { exact: true })).toBeVisible()

    // Editar: tocar solo el título, sin abrir ni modificar el bloque de Back Squat
    await page.getByTitle('Editar WOD').click()
    await expect(page.getByRole('heading', { name: 'Editar planificación' })).toBeVisible()
    await page.getByPlaceholder('Ej. Fran, AMRAP 20, For Time, Día de fuerza...').fill(`${title} v2`)
    await page.getByRole('button', { name: 'Guardar cambios' }).click()
    await expect(page.getByRole('heading', { name: `WOD — ${title} v2` })).toBeVisible()

    await page.reload()
    await expect(page.getByText('5×5', { exact: true })).toBeVisible()
    p.expectNoErrors()
  })

  test('CLS-12 clase inexistente (o de otro gym) muestra "Clase no encontrada" en vez de pantalla en blanco', async ({ page }) => {
    const p = await open(page, `/dashboard/classes/${crypto.randomUUID()}`)
    await expect(page.getByText('Clase no encontrada')).toBeVisible()
    p.expectNoErrors()
  })
})

// ─── CLS-04 · asistencia (coach) ──────────────────────────────────────────────

test.describe('CLS — asistencia (coach)', () => {
  test.use({ storageState: authFile('coach') })

  test('CLS-04 marcar y desmarcar asistencia', async ({ page }) => {
    const type = await createClassType(`${PREFIX} Asistencia ${RUN}`)
    // Día lejano en el pasado (igual lógica que farOffset pero hacia atrás, para no
    // colisionar con otras corridas): marcar "asistió" exige que la clase ya haya
    // empezado (ver fix adjunto a PATCH /bookings/:bookingId/attend).
    const day = localDay(-farOffset(3))
    const cls = await createClass(type.id, day, '10:00', '11:00')
    const student = NORTE.member5
    const { status } = await api('admin', 'POST', '/bookings/assign', { classId: cls.id, userId: await userId(student.email) })
    expect(status).toBe(201)

    const bookingStatus = async () => {
      const { data } = await api('admin', 'GET', `/classes/${cls.id}`)
      return (data.bookings as { status: string; user: { email: string } }[]).find(b => b.user.email === student.email)?.status
    }

    const p = await open(page, `/dashboard/classes/${cls.id}`)
    const row = page.locator('div.rounded-lg').filter({ hasText: student.email }).last()
    await expect(row).toBeVisible()
    await row.getByRole('button', { name: 'Asistencia', exact: true }).click()
    await expect(row.getByText('Asistió')).toBeVisible()
    await expect(page.getByText('1 asistieron').first()).toBeVisible()
    expect(await bookingStatus()).toBe('ATTENDED')

    // Desmarcar: la fila vuelve a ofrecer «Asistencia» y la reserva queda CONFIRMED.
    // name:'Asistencia' sin exact:true matchea por substring: también matchea el botón
    // "Quitar asistencia" que sigue visible, así que el toBeVisible() de abajo quedaba
    // satisfecho de inmediato sin esperar a que el PATCH de desmarcar terminara — la
    // causa real del flake (CLS-04), no una carrera en la app.
    await row.getByRole('button', { name: 'Quitar asistencia' }).click({ timeout: 5_000 })
    await expect(row.getByRole('button', { name: 'Asistencia', exact: true })).toBeVisible()
    expect(await bookingStatus()).toBe('CONFIRMED')
    p.expectNoErrors()
  })
})

// ─── CLS-05 / CLS-08 · tipos de clase ─────────────────────────────────────────

test.describe('CLS — tipos de clase (admin)', () => {
  test('CLS-05 tipos de clase: crear, editar e importar desde Excel', async ({ page }) => {
    const name = `${PREFIX} Tipo ${RUN}`
    const p = await open(page, '/dashboard/settings/class-types')

    // Crear
    await page.getByRole('button', { name: 'Nuevo tipo' }).click()
    await page.getByPlaceholder('ej: CrossFit, Yoga, Weightlifting').fill(name)
    await page.getByPlaceholder('Descripción opcional...').fill('Creado por la suite E2E')
    await page.getByRole('button', { name: /Halterofilia/ }).click()
    await page.getByRole('button', { name: 'Crear tipo de clase' }).click()
    await expect(page.getByText('Tipo de clase creado')).toBeVisible()
    const row = (n: string) => page.locator('.card').filter({ has: page.getByText(n, { exact: true }) })
    await expect(row(name)).toBeVisible()
    const types = async () => (await api('admin', 'GET', '/class-types')).data as { id: string; name: string; discipline: string; blocks: unknown[] }[]
    const created = (await types()).find(t => t.name === name)
    expect(created?.discipline).toBe('weightlifting')

    // Editar
    await row(name).getByRole('button').first().click()
    await expect(page.getByRole('heading', { name: 'Editar tipo' })).toBeVisible()
    await page.getByPlaceholder('ej: CrossFit, Yoga, Weightlifting').fill(`${name} editado`)
    await page.getByRole('button', { name: 'Guardar cambios' }).click()
    await expect(page.getByText('Tipo de clase actualizado')).toBeVisible()
    await expect(row(`${name} editado`)).toBeVisible()
    expect((await types()).find(t => t.id === created!.id)?.name).toBe(`${name} editado`)

    // Importar desde Excel (dos tipos, con bloques)
    const importA = `${PREFIX} Import A ${RUN}`
    const importB = `${PREFIX} Import B ${RUN}`
    const file = join(tmpdir(), `e2e-class-types-${RUN}.xlsx`)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ['tipo_clase', 'disciplina', 'color', 'descripcion', 'bloque_nombre', 'bloque_duracion_mins', 'bloque_notas', 'bloque_opcional'],
      [importA, 'crossfit', '#6366f1', 'Importado A', 'Entrada en calor', 10, '', 'No'],
      [importA, 'crossfit', '#6366f1', '', 'Metcon', 20, 'For time', 'No'],
      [importB, 'endurance', '#10b981', 'Importado B', 'Trabajo principal', 40, '', 'Sí'],
    ]), 'Tipos de clase')
    XLSX.writeFile(wb, file)

    await open(page, '/dashboard/settings/class-types/import')
    await page.locator('input[type="file"]').setInputFiles(file)
    await page.getByRole('button', { name: 'Importar 2 tipos' }).click()
    await expect(page.getByText('Importación completada')).toBeVisible()
    await expect(page.getByText('2 tipos creados')).toBeVisible()

    const all = await types()
    const a = all.find(t => t.name === importA)
    const b = all.find(t => t.name === importB)
    expect(a?.blocks).toHaveLength(2)
    expect(b?.blocks).toHaveLength(1)
    expect(b?.discipline).toBe('endurance')
    p.expectNoErrors()
  })

  // BUG: la web ofrece disciplinas que la API rechaza. settings/class-types/page.tsx (DISCIPLINES, L25-41)
  // tiene powerlifting, gymnastics, rowing, cycling, mobility, etc., pero createClassTypeSchema
  // (apps/api/src/modules/classes/classes.schema.ts L14) solo acepta crossfit|weightlifting|endurance|hyrox|manual
  // → 400, y la página intenta renderizar el objeto de error de Zod.
  test('CLS-08 crear tipo de clase con disciplina «Fuerza» (ofrecida por la web)', async ({ page }) => {
    const name = `${PREFIX} Fuerza ${RUN}`
    const p = await open(page, '/dashboard/settings/class-types')
    await page.getByRole('button', { name: 'Nuevo tipo' }).click()
    await page.getByPlaceholder('ej: CrossFit, Yoga, Weightlifting').fill(name)
    await page.getByRole('button', { name: /^Fuerza/ }).click()
    await page.getByRole('button', { name: 'Crear tipo de clase' }).click()
    await expect(page.getByText('Tipo de clase creado')).toBeVisible()
    const created = ((await api('admin', 'GET', '/class-types')).data as { id: string; name: string }[]).find(t => t.name === name)
    expect(created).toBeTruthy()
    p.expectNoErrors()
  })
})
