/**
 * Flow 2: Crear plan → ver disponible en lista
 *
 * Nota sobre "asignar pasarelas":
 *  La UI de /dashboard/plans NO tiene un formulario de pasarelas integrado.
 *  La configuración de pasarelas se hace por gym en /dashboard/settings.
 *  Este flow verifica la creación del plan y su aparición en la lista.
 *
 * Verifica:
 *  - Botón "Nuevo plan" abre el formulario
 *  - Crear plan con nombre, precio y duración
 *  - Plan aparece en la lista tras crear
 *  - Crear plan trial (gratuito, checkbox isTrial)
 *  - El botón Cancelar cierra el formulario
 */
import { test, expect } from '@playwright/test'
import { PlansPage } from './pages/PlansPage'
import { navigateTo } from './helpers/auth'

// Nombre único por run para evitar colisiones entre ejecuciones
const RUN_ID = Date.now()

test.describe('Flow 2 — Crear plan → ver en lista', () => {
  test('crear plan mensual y verificar que aparece en lista', async ({ page }) => {
    const plansPage = new PlansPage(page)
    await navigateTo(page, '/dashboard/plans')
    await plansPage.waitForLoad()

    const planName = `Plan E2E ${RUN_ID}`

    await plansPage.createPlan({
      name: planName,
      price: 35000,
      currency: 'CLP',
      durationDays: '30',
      description: 'Plan creado por test E2E',
    })

    // Mensaje de éxito
    await expect(plansPage.successMessage).toBeVisible({ timeout: 8_000 })

    // El plan debe aparecer en la lista
    await plansPage.expectPlanVisible(planName)
  })

  test('crear plan de prueba (trial, gratuito)', async ({ page }) => {
    const plansPage = new PlansPage(page)
    await navigateTo(page, '/dashboard/plans')
    await plansPage.waitForLoad()

    const trialName = `Trial E2E ${RUN_ID}`

    await plansPage.createPlan({
      name: trialName,
      isTrial: true,
      durationDays: '7',
    })

    await expect(plansPage.successMessage).toBeVisible({ timeout: 8_000 })
    await plansPage.expectPlanVisible(trialName)

    // Plan trial debe mostrar badge "Prueba"
    await expect(page.getByText('Prueba').first()).toBeVisible()
  })

  test('formulario valida campo nombre requerido (browser HTML5)', async ({ page }) => {
    const plansPage = new PlansPage(page)
    await navigateTo(page, '/dashboard/plans')
    await plansPage.waitForLoad()

    await plansPage.newPlanButton.click()
    // Rellenar solo el precio, dejar nombre vacío
    await plansPage.planPriceInput.fill('10000')
    await plansPage.createPlanButton.click()

    // El submit nativo de HTML5 bloquea la acción (campo required)
    // El formulario sigue visible — no se cerró
    await expect(plansPage.createPlanButton).toBeVisible()
  })

  test('botón Cancelar cierra el formulario', async ({ page }) => {
    const plansPage = new PlansPage(page)
    await navigateTo(page, '/dashboard/plans')
    await plansPage.waitForLoad()

    await plansPage.newPlanButton.click()
    await expect(plansPage.createPlanButton).toBeVisible()

    // El botón "Nuevo plan" cambia a "Cancelar" cuando el form está abierto
    await page.getByRole('button', { name: /cancelar/i }).click()
    await expect(plansPage.createPlanButton).not.toBeVisible()
  })

  // PENDIENTE: asignar pasarelas desde UI — no implementado en /dashboard/plans
  test.skip('asignar pasarelas al plan — UI pendiente de implementar', async () => {
    // TODO: cuando /dashboard/plans tenga selector de pasarelas de pago
  })
})
