/**
 * PLN — Planes
 * Casos en docs/TESTING_STRATEGY.md §4.
 *
 * Cada plan que crean estos tests se desactiva al terminar (DELETE /plans/:id): GET /plans solo
 * lista planes activos, ordenados por precio, y el primero es el que preseleccionan los modales
 * de pago que usan otros specs.
 */
import { test, expect, type Page } from '@playwright/test'
import { QA, api, open } from '../support/qa'

const uid = () => `${Date.now()}${Math.floor(Math.random() * 1000)}`

const created: string[] = []
test.afterEach(async () => {
  while (created.length) await api('admin', 'DELETE', `/plans/${created.pop()}`)
})

/** Input que sigue a un <label> (el formulario de planes no usa htmlFor) */
const field = (scope: Page | ReturnType<Page['locator']>, label: string) =>
  scope.locator(`xpath=.//label[normalize-space()="${label}"]/following-sibling::*[self::input or self::select][1]`)

/** Tarjeta de un plan en la grilla */
const planCard = (page: Page, name: string) =>
  page.locator('.card').filter({ has: page.getByRole('heading', { level: 3, name, exact: true }) })

async function findPlan(name: string) {
  const { data } = await api('admin', 'GET', '/plans')
  return (data as any[]).find(p => p.name === name)
}

test.describe('PLN — admin', () => {
  test('PLN-01 crear plan de $35.000 CLP → se muestra $35.000 al recargar', async ({ page }) => {
    const name = `QA Plan ${uid()}`
    const p = await open(page, '/dashboard/plans')
    await page.getByRole('button', { name: 'Nuevo plan' }).click()
    const form = page.locator('form').filter({ has: page.getByRole('heading', { name: 'Nuevo plan' }) })
    await field(form, 'Nombre *').fill(name)
    await field(form, 'Precio *').fill('35000')
    await expect(field(form, 'Moneda')).toHaveValue('CLP')
    await form.getByRole('button', { name: 'Crear plan' }).click()
    await expect(page.getByText('Plan creado correctamente')).toBeVisible()

    const plan = await findPlan(name)
    expect(plan, 'el plan no quedó en la API').toBeTruthy()
    created.push(plan.id)
    expect(plan.priceCents).toBe(35000)
    expect(plan.currency).toBe('CLP')
    expect(plan.durationDays).toBe(30)

    await page.reload()
    await page.waitForLoadState('networkidle')
    const card = planCard(page, name)
    await expect(card).toContainText('$35.000')
    await expect(card).toContainText('CLP / mes')
    await expect(card).toContainText('30 días de vigencia')
    await expect(card).not.toContainText(/\b350\b|3\.500\.000/)
    p.expectNoErrors()
  })

  test('PLN-02 editar plan sin tocar el precio → el precio no cambia', async ({ page }) => {
    const name = `QA Plan Edit ${uid()}`
    const res = await api('admin', 'POST', '/plans', { name, priceCents: 49990, currency: 'CLP' })
    expect(res.status).toBe(201)
    created.push(res.data.id)

    const p = await open(page, '/dashboard/plans')
    await planCard(page, name).getByRole('button', { name: 'Editar' }).click()
    const edit = page.locator('.card').filter({ has: page.getByRole('heading', { name: 'Editar plan' }) })
    await expect(field(edit, 'Precio *')).toHaveValue('49990')
    await field(edit, 'Descripcion').fill('Descripción editada por E2E')
    await edit.getByRole('button', { name: 'Guardar cambios' }).click()
    await expect(page.getByText('Plan actualizado correctamente')).toBeVisible()

    const plan = await findPlan(name)
    expect(plan.priceCents).toBe(49990)
    expect(plan.description).toBe('Descripción editada por E2E')

    await page.reload()
    await page.waitForLoadState('networkidle')
    const card = planCard(page, name)
    await expect(card).toContainText('49.990')
    await expect(card).toContainText('Descripción editada por E2E')
    p.expectNoErrors()
  })

  test('PLN-08 activar auto-renovación al crear un plan → se persiste (antes se ignoraba en silencio)', async ({ page }) => {
    const name = `QA Plan AutoRenew ${uid()}`
    const p = await open(page, '/dashboard/plans')
    await page.getByRole('button', { name: 'Nuevo plan' }).click()
    const form = page.locator('form').filter({ has: page.getByRole('heading', { name: 'Nuevo plan' }) })
    await field(form, 'Nombre *').fill(name)
    await field(form, 'Precio *').fill('25000')
    await form.getByRole('checkbox', { name: /Auto-renovación/ }).check()
    await field(form, 'Días antes de renovar').fill('7')
    await form.getByRole('button', { name: 'Crear plan' }).click()
    await expect(page.getByText('Plan creado correctamente')).toBeVisible()

    const plan = await findPlan(name)
    expect(plan, 'el plan no quedó en la API').toBeTruthy()
    created.push(plan.id)
    expect(plan.autoRenewEnabled).toBe(true)
    expect(plan.autoRenewDaysBefore).toBe(7)
    p.expectNoErrors()
  })

  test('PLN-05 editar plan en USD sin tocar el precio conserva los centavos', async ({ page }) => {
    const name = `QA Plan USD ${uid()}`
    const res = await api('admin', 'POST', '/plans', { name, priceCents: 1999, currency: 'USD' })
    expect(res.status).toBe(201)
    created.push(res.data.id)

    const p = await open(page, '/dashboard/plans')
    await expect(planCard(page, name)).toContainText('19,99')
    await planCard(page, name).getByRole('button', { name: 'Editar' }).click()
    const edit = page.locator('.card').filter({ has: page.getByRole('heading', { name: 'Editar plan' }) })
    await field(edit, 'Nombre *').fill(`${name} v2`)
    await edit.getByRole('button', { name: 'Guardar cambios' }).click()
    await expect(page.getByText('Plan actualizado correctamente')).toBeVisible()

    const plan = await findPlan(`${name} v2`)
    expect(plan.priceCents).toBe(1999)
    expect(plan.currency).toBe('USD')
    p.expectNoErrors()
  })

  test('PLN-03 plan trial (gratis)', async ({ page }) => {
    const name = `QA Trial ${uid()}`
    const p = await open(page, '/dashboard/plans')
    await page.getByRole('button', { name: 'Nuevo plan' }).click()
    const form = page.locator('form').filter({ has: page.getByRole('heading', { name: 'Nuevo plan' }) })
    await form.getByRole('checkbox', { name: /Plan de prueba/ }).check()
    // Trial no pide precio
    await expect(field(form, 'Precio *')).toHaveCount(0)
    await field(form, 'Nombre *').fill(name)
    await form.getByRole('button', { name: 'Crear plan' }).click()
    await expect(page.getByText('Plan creado correctamente')).toBeVisible()

    const plan = await findPlan(name)
    expect(plan, 'el plan no quedó en la API').toBeTruthy()
    created.push(plan.id)
    expect(plan.isTrial).toBe(true)
    expect(plan.priceCents).toBe(0)

    const card = planCard(page, name)
    await expect(card).toContainText('Gratis')
    await expect(card).toContainText('TRIAL')
    await expect(card).toContainText('Plan de prueba')

    // Asignarlo a un alumno crea una membresía TRIAL sin cobro y de 30 días
    const u = uid()
    const member = await api('admin', 'POST', '/users', {
      name: `QA E2E Trial ${u}`, email: `qa-e2e-trial-${u}@qa-norte.test`, password: 'QaE2e2026!', role: 'MEMBER',
    })
    expect(member.status).toBe(201)
    const m = await api('admin', 'POST', '/memberships', {
      userId: member.data.id, planId: plan.id, startsAt: new Date().toISOString(), status: 'ACTIVE',
    })
    expect(m.status, JSON.stringify(m.data)).toBe(201)
    expect(m.data.status).toBe('TRIAL')
    expect(m.data.pricePaid).toBe(0)
    expect(Math.round((new Date(m.data.endsAt).getTime() - new Date(m.data.startsAt).getTime()) / 86_400_000)).toBe(30)
    await api('admin', 'PATCH', `/memberships/${m.data.id}`, { status: 'INACTIVE' })
    p.expectNoErrors()
  })

  test('PLN-06 los planes sembrados muestran su precio en CLP', async ({ page }) => {
    const p = await open(page, '/dashboard/plans')
    const { mensual, ilimitado } = QA.gyms.norte.plans
    await expect(planCard(page, mensual.name)).toContainText('35.000')
    await expect(planCard(page, ilimitado.name)).toContainText('49.990')
    // Los planes de otro gym no aparecen
    await expect(planCard(page, QA.gyms.sur.plans.mensual.name)).toHaveCount(0)
    p.expectNoErrors()
  })

  test('PLN-07 pausar un plan lo oculta, "Mostrar pausados" lo revela, y se puede reactivar', async ({ page }) => {
    const name = `QA Plan Pausar ${uid()}`
    const res = await api('admin', 'POST', '/plans', { name, priceCents: 15000, currency: 'CLP' })
    expect(res.status).toBe(201)
    created.push(res.data.id)

    const p = await open(page, '/dashboard/plans')
    page.once('dialog', d => d.accept())
    await planCard(page, name).locator('button').last().click()
    await expect(page.getByText('Plan pausado')).toBeVisible()

    // Desaparece de la grilla por defecto...
    await expect(planCard(page, name)).toHaveCount(0)
    // ...pero sigue existiendo, no borrado
    const { data: afterPause } = await api('admin', 'GET', '/plans?includeInactive=true')
    const paused = (afterPause as any[]).find(x => x.name === name)
    expect(paused?.isActive).toBe(false)

    // "Mostrar pausados" lo revela con el badge
    await page.getByText('Mostrar pausados').click()
    const pausedCard = planCard(page, name)
    await expect(pausedCard).toBeVisible()
    await expect(pausedCard).toContainText('PAUSADO')

    // Reactivar lo vuelve a dejar activo y visible sin el filtro
    await pausedCard.getByRole('button', { name: 'Reactivar' }).click()
    await expect(page.getByText('Plan reactivado')).toBeVisible()
    await page.getByText('Mostrar pausados').click() // apagar el filtro
    await expect(planCard(page, name)).toBeVisible()
    await expect(planCard(page, name)).not.toContainText('PAUSADO')

    const plan = await findPlan(name)
    expect(plan?.isActive).toBe(true)
    p.expectNoErrors()
  })
})
