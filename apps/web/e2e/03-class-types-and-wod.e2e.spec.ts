/**
 * Flow 3: Crear tipo de clase CrossFit → planificar WOD del día → publicar
 *
 * Rutas reales:
 *  - Tipos de clase: /dashboard/settings/class-types
 *  - El WOD se gestiona desde /dashboard/classes
 *  - /dashboard/wods es un redirect a /dashboard/classes
 *
 * Verifica:
 *  - La UI de tipos de clase carga correctamente
 *  - Hay botón para crear nuevo tipo
 *  - /dashboard/classes carga el calendario
 *  - /dashboard/wods redirige a /dashboard/classes
 *  - Importación de class-types es accesible
 */
import { test, expect } from '@playwright/test'
import { ClassTypesPage } from './pages/ClassTypesPage'
import { navigateTo } from './helpers/auth'

test.describe('Flow 3 — Tipos de clase y WOD', () => {
  test('página de tipos de clase carga correctamente', async ({ page }) => {
    await navigateTo(page, '/dashboard/settings/class-types')
    await expect(page).toHaveURL(/\/dashboard\/settings\/class-types/)

    // Debe haber un botón para crear nuevo tipo
    await expect(
      page.getByRole('button', { name: /nuevo tipo/i })
    ).toBeVisible({ timeout: 10_000 })
  })

  test('hay enlace a importar tipos de clase por Excel', async ({ page }) => {
    await navigateTo(page, '/dashboard/settings/class-types')

    const importLink = page.getByRole('link', { name: /importar/i }).first()
    await expect(importLink).toBeVisible({ timeout: 8_000 })
  })

  test('/dashboard/classes carga el calendario de clases', async ({ page }) => {
    await navigateTo(page, '/dashboard/classes')
    await expect(page).toHaveURL(/\/dashboard\/classes/)

    // El calendario tiene un botón "Hoy" siempre visible en el sidebar del calendario
    await expect(
      page.getByRole('button', { name: 'Hoy' }).first()
    ).toBeVisible({ timeout: 10_000 })
  })

  test('/dashboard/wods redirige a /dashboard/classes', async ({ page }) => {
    await navigateTo(page, '/dashboard/wods')
    // wods/page.tsx hace router.replace('/dashboard/classes')
    await expect(page).toHaveURL(/\/dashboard\/classes/, { timeout: 8_000 })
  })

  test('página de importación de class-types es accesible', async ({ page }) => {
    await navigateTo(page, '/dashboard/settings/class-types/import')
    await expect(page).toHaveURL(/\/dashboard\/settings\/class-types\/import/)

    // La página tiene botón de descargar plantilla
    await expect(
      page.getByRole('button', { name: /descargar plantilla/i })
    ).toBeVisible({ timeout: 8_000 })
  })

  // PENDIENTE: creación de ClassType vía formulario completo
  // El formulario no tiene data-testid — selectores frágiles.
  // Prioridad: agregar data-testid al formulario y completar aquí.
  test.skip('crear tipo de clase CrossFit con bloques — data-testid pendiente', async () => {
    // TODO: cuando settings/class-types/page.tsx tenga data-testid en inputs del form
  })
})
