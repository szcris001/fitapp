import { type Page, type Locator, expect } from '@playwright/test'

/**
 * Page Object para /dashboard/plans
 *
 * Nota importante: los labels del formulario de planes NO tienen atributo `for`/`htmlFor`.
 * Por eso usamos `getByPlaceholder` o `locator('input')` en contexto del formulario.
 */
export class PlansPage {
  readonly page: Page

  constructor(page: Page) {
    this.page = page
  }

  async goto() {
    await this.page.goto('/dashboard/plans')
    await expect(this.page).toHaveURL(/\/dashboard\/plans/)
  }

  async waitForLoad() {
    // Esperar que desaparezca el loading
    await this.page.waitForFunction(
      () => !document.body.textContent?.includes('Cargando planes'),
      { timeout: 10_000 },
    )
  }

  get newPlanButton(): Locator {
    return this.page.getByRole('button', { name: /nuevo plan/i })
  }

  get cancelButton(): Locator {
    return this.page.getByRole('button', { name: /cancelar/i })
  }

  /** Los inputs del formulario usan placeholders (los labels no tienen `for`) */
  get planNameInput(): Locator {
    return this.page.getByPlaceholder(/Plan Mensual|Clase de Prueba/i)
  }

  get planDescriptionInput(): Locator {
    return this.page.getByPlaceholder('Qué incluye este plan...')
  }

  get planPriceInput(): Locator {
    return this.page.getByPlaceholder('30000')
  }

  /** El select de moneda y duración son los únicos <select> en el formulario */
  get planCurrencySelect(): Locator {
    // El primer select en el form (dentro de form tag)
    return this.page.locator('form select').first()
  }

  get planDurationSelect(): Locator {
    // El select de duración tiene opciones con texto "Mensual", "Anual", etc.
    return this.page.locator('form select').last()
  }

  get createPlanButton(): Locator {
    return this.page.getByRole('button', { name: /crear plan/i })
  }

  get successMessage(): Locator {
    return this.page.getByText('Plan creado correctamente')
  }

  get errorMessage(): Locator {
    return this.page.locator('.bg-red-50').first()
  }

  async createPlan(opts: {
    name: string
    price?: number
    currency?: string
    durationDays?: string
    description?: string
    isTrial?: boolean
  }) {
    await this.newPlanButton.click()

    if (opts.isTrial) {
      // El checkbox de "Plan de prueba" está identificable por su texto adyacente
      await this.page.getByText('Plan de prueba').first().click()
    }

    await this.planNameInput.fill(opts.name)
    if (opts.description) await this.planDescriptionInput.fill(opts.description)

    if (!opts.isTrial && opts.price !== undefined) {
      await this.planPriceInput.fill(String(opts.price))
    }

    if (opts.currency) {
      await this.planCurrencySelect.selectOption(opts.currency)
    }

    if (opts.durationDays) {
      // El select de duración tiene options con valor numérico (days)
      await this.planDurationSelect.selectOption(opts.durationDays)
    }

    await this.createPlanButton.click()
  }

  /** Verifica que un plan con el nombre dado aparezca en la lista */
  async expectPlanVisible(name: string) {
    await expect(this.page.getByText(name)).toBeVisible({ timeout: 8_000 })
  }
}
