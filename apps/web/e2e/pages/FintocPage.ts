import { type Page, type Locator, expect } from '@playwright/test'

/**
 * Page Object para /dashboard/fintoc
 * Conciliación bancaria.
 */
export class FintocPage {
  readonly page: Page

  constructor(page: Page) {
    this.page = page
  }

  async goto() {
    await this.page.goto('/dashboard/fintoc')
    await expect(this.page).toHaveURL(/\/dashboard\/fintoc/)
  }

  async waitForLoad() {
    // Esperar a que carguen los tabs (elemento siempre presente)
    // Usamos getByRole('button') para evitar strict mode violation con múltiples "Pendientes"
    await expect(this.page.getByRole('button', { name: 'Pendientes' })).toBeVisible({ timeout: 10_000 })
  }

  get pageHeading(): Locator {
    return this.page.getByText('Conciliación bancaria')
  }

  get syncButton(): Locator {
    return this.page.getByRole('button', { name: /sincronizar/i })
  }

  get pendientesTab(): Locator {
    return this.page.getByRole('button', { name: /pendientes/i })
  }

  get coincidenciasTab(): Locator {
    return this.page.getByRole('button', { name: /coincidencias/i })
  }

  get confirmadosTab(): Locator {
    return this.page.getByRole('button', { name: /confirmados/i })
  }

  get rechazadosTab(): Locator {
    return this.page.getByRole('button', { name: /rechazados/i })
  }

  /** Stat card de movimientos pendientes */
  get pendingStatCard(): Locator {
    return this.page.getByText('Pendientes').first()
  }
}
