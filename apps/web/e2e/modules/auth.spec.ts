/**
 * AUTH — Login y sesión · NAV — Menú y permisos por rol
 * Casos en docs/TESTING_STRATEGY.md §4.
 */
import { test, expect, type Page } from '@playwright/test'
import { QA, ROLES, authFile, open } from '../support/qa'

async function fillLogin(page: Page, email: string, password: string, slug?: string) {
  await page.goto('/login')
  if (slug) await page.getByPlaceholder('mi-gimnasio').fill(slug)
  await page.getByPlaceholder(/admin@/i).fill(email)
  await page.getByPlaceholder('••••••••').fill(password)
  await page.getByRole('button', { name: /iniciar sesión/i }).click()
}

test.describe('AUTH — login por UI', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test('AUTH-01 login correcto con slug → dashboard', async ({ page }) => {
    const { gym, user } = ROLES.admin
    await fillLogin(page, user.email, QA.password, gym.slug)
    await expect(page).toHaveURL(/\/dashboard$/)
    await expect(page.getByTitle('Cerrar sesión')).toBeVisible()
  })

  test('AUTH-02 contraseña incorrecta → error y sin sesión', async ({ page }) => {
    const { gym, user } = ROLES.admin
    await fillLogin(page, user.email, 'incorrecta-123', gym.slug)
    await expect(page.getByText(/credenciales/i)).toBeVisible()
    await expect(page).toHaveURL(/\/login/)
    expect(await page.evaluate(() => localStorage.getItem('fitapp_token'))).toBeNull()
  })

  test('AUTH-03 email de un gym con el slug de otro → rechazado', async ({ page }) => {
    await fillLogin(page, QA.gyms.norte.users.admin.email, QA.password, QA.gyms.sur.slug)
    await expect(page.getByText(/credenciales/i)).toBeVisible()
    await expect(page).toHaveURL(/\/login/)
  })

  test('AUTH-04 superadmin sin slug → /superadmin', async ({ page }) => {
    await fillLogin(page, QA.superadmin.email, QA.password)
    await expect(page).toHaveURL(/\/superadmin/)
  })

  test('AUTH-05 sin sesión, URL del panel → login', async ({ page }) => {
    await page.goto('/dashboard/users')
    await expect(page).toHaveURL(/\/login/)
  })

  test('AUTH-07 un alumno (MEMBER) no entra al panel web', async ({ page }) => {
    const { gym, user } = ROLES.member
    await fillLogin(page, user.email, QA.password, gym.slug)
    await expect(page.getByText(/app/i).first()).toBeVisible()
    await expect(page).toHaveURL(/\/login/)
    expect(await page.evaluate(() => localStorage.getItem('fitapp_token'))).toBeNull()
  })
})

test.describe('AUTH — sesión existente', () => {
  test('AUTH-06 logout limpia la sesión y el panel vuelve a pedir login', async ({ browser }) => {
    // Sesión propia: el logout revoca el refresh token y no debe afectar a los demás tests
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } })
    const page = await context.newPage()
    const { gym, user } = ROLES.admin
    await fillLogin(page, user.email, QA.password, gym.slug)
    await expect(page).toHaveURL(/\/dashboard$/)
    await page.getByTitle('Cerrar sesión').click()
    await expect(page).toHaveURL(/\/login/)
    expect(await page.evaluate(() => localStorage.getItem('fitapp_token'))).toBeNull()
    await page.goto('/dashboard/users')
    await expect(page).toHaveURL(/\/login/)
    await context.close()
  })

  test('AUTH-09 recargar (F5) una página del panel mantiene la sesión', async ({ page }) => {
    for (const path of ['/dashboard/payments', '/dashboard/users', '/dashboard/plans']) {
      await page.goto(path)
      await page.reload()
      await page.waitForLoadState('networkidle')
      await expect(page).toHaveURL(new RegExp(path))
    }
  })
})

const ADMIN_MENU = ['Inicio', 'Alumnos', 'Clases', 'Pizarra', 'Evolución', 'Planes', 'Pagos', 'Conciliación', 'Reportes', 'Comunicación', 'Configuración']
const COACH_MENU = ['Inicio', 'Alumnos', 'Clases', 'Pizarra', 'Evolución']
const menuItem = (page: Page, label: string) => page.locator('nav, aside').getByRole('button', { name: label, exact: true })

test.describe('NAV — admin', () => {
  test('NAV-01 el admin ve todo el menú', async ({ page }) => {
    await open(page, '/dashboard')
    for (const label of ADMIN_MENU) await expect(menuItem(page, label), label).toBeVisible()
  })

  test('NAV-04 todas las páginas del menú cargan sin errores', async ({ page }) => {
    test.setTimeout(120_000)
    const paths = ['/dashboard', '/dashboard/users', '/dashboard/classes', '/dashboard/wods', '/dashboard/evolution',
      '/dashboard/plans', '/dashboard/payments', '/dashboard/fintoc', '/dashboard/reports', '/dashboard/communications',
      '/dashboard/alerts', '/dashboard/settings', '/dashboard/settings/class-types', '/dashboard/staff',
      '/dashboard/settings/email-templates', '/dashboard/settings/movements']
    for (const path of paths) {
      const p = await open(page, path)
      await expect(page.locator('body'), path).not.toContainText(/Application error|Unhandled Runtime Error/)
      p.expectNoErrors()
    }
  })
})

test.describe('NAV — coach', () => {
  test.use({ storageState: authFile('coach') })

  test('NAV-02 el coach ve solo su menú', async ({ page }) => {
    await open(page, '/dashboard')
    for (const label of COACH_MENU) await expect(menuItem(page, label), label).toBeVisible()
    for (const label of ADMIN_MENU.filter(l => !COACH_MENU.includes(l))) {
      await expect(menuItem(page, label), label).toHaveCount(0)
    }
  })

  test('NAV-03 el coach no entra a páginas de admin por URL', async ({ page }) => {
    for (const path of ['/dashboard/payments', '/dashboard/plans', '/dashboard/settings', '/dashboard/fintoc', '/dashboard/reports']) {
      await page.goto(path)
      await expect(page, path).toHaveURL(/\/dashboard$/)
    }
  })
})
