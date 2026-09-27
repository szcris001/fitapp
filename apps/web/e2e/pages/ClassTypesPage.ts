import { type Page, type Locator, expect } from '@playwright/test'

/**
 * Page Object para /dashboard/settings/class-types
 */
export class ClassTypesPage {
  readonly page: Page

  constructor(page: Page) {
    this.page = page
  }

  async goto() {
    await this.page.goto('/dashboard/settings/class-types')
    await expect(this.page).toHaveURL(/\/dashboard\/settings\/class-types/)
  }

  async waitForLoad() {
    await this.page.waitForFunction(
      () => !document.body.textContent?.includes('Cargando'),
      { timeout: 10_000 },
    )
  }

  get newClassTypeButton(): Locator {
    return this.page.getByRole('button', { name: /nuevo tipo/i })
  }

  get importButton(): Locator {
    return this.page.getByRole('link', { name: /importar/i })
  }
}
