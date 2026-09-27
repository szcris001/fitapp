/**
 * Flow 5: Confirmar comprobante de transferencia → estado plan actualizado
 *
 * Ruta: /dashboard/fintoc
 *
 * La pantalla de conciliación muestra tabs PENDING|MATCHED|CONFIRMED|REJECTED.
 * El flujo completo de confirmar un movimiento real se cubre en Vitest
 * (fintoc.integration.test.ts, 57 tests). El E2E UI verifica la estructura.
 *
 * Verifica:
 *  - Página carga con 4 tabs
 *  - Tabs son navegables
 *  - Botón Sincronizar está presente
 *  - Solo accesible para ADMIN (link en nav)
 */
import { test, expect } from '@playwright/test'
import { FintocPage } from './pages/FintocPage'
import { navigateTo } from './helpers/auth'

test.describe('Flow 5 — Conciliación bancaria Fintoc', () => {
  test('página de conciliación carga con los 4 tabs', async ({ page }) => {
    const fintocPage = new FintocPage(page)
    await navigateTo(page, '/dashboard/fintoc')
    await fintocPage.waitForLoad()

    await expect(fintocPage.pendientesTab).toBeVisible()
    await expect(fintocPage.coincidenciasTab).toBeVisible()
    await expect(fintocPage.confirmadosTab).toBeVisible()
    await expect(fintocPage.rechazadosTab).toBeVisible()
  })

  test('tabs son clickeables y no producen error JS', async ({ page }) => {
    const fintocPage = new FintocPage(page)
    await navigateTo(page, '/dashboard/fintoc')
    await fintocPage.waitForLoad()

    const jsErrors: string[] = []
    page.on('pageerror', (err) => jsErrors.push(err.message))

    await fintocPage.confirmadosTab.click()
    await fintocPage.rechazadosTab.click()
    await fintocPage.pendientesTab.click()

    // No debe haber errores JS
    expect(jsErrors).toHaveLength(0)
    await expect(page).toHaveURL(/\/dashboard\/fintoc/)
  })

  test('botón Sincronizar está presente', async ({ page }) => {
    const fintocPage = new FintocPage(page)
    await navigateTo(page, '/dashboard/fintoc')
    await fintocPage.waitForLoad()

    await expect(fintocPage.syncButton).toBeVisible()
  })

  test('botón Conciliación aparece en el sidebar del dashboard', async ({ page }) => {
    await navigateTo(page, '/dashboard')

    // El sidebar ya debe estar visible después del login
    // El sidebar usa <button onClick={router.push}>, NO <a href>
    const navBtn = page.getByRole('button', { name: /^Conciliacion$/i })
    await expect(navBtn).toBeVisible({ timeout: 8_000 })
  })

  test('navegar desde sidebar a Fintoc', async ({ page }) => {
    await navigateTo(page, '/dashboard')

    // Click en el button del sidebar (SPA navigation)
    const navBtn = page.getByRole('button', { name: /^Conciliacion$/i })
    await navBtn.click()
    await expect(page).toHaveURL(/\/dashboard\/fintoc/, { timeout: 8_000 })
  })
})
