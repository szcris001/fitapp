import { type Page, type Locator, expect } from '@playwright/test'

/**
 * Page Object para /dashboard/alerts
 * Alertas IA de retención de alumnos.
 */
export class AlertsPage {
  readonly page: Page

  constructor(page: Page) {
    this.page = page
  }

  async goto() {
    await this.page.goto('/dashboard/alerts')
    await expect(this.page).toHaveURL(/\/dashboard\/alerts/)
  }

  async waitForLoad() {
    await this.page.waitForFunction(
      () => !document.body.textContent?.includes('Cargando alertas'),
      { timeout: 10_000 },
    )
  }

  get pageHeading(): Locator {
    return this.page.getByText('Alertas IA y retención')
  }

  get generateInsightsButton(): Locator {
    return this.page.getByRole('button', { name: /generar insights/i })
  }

  get insightsSectionHeading(): Locator {
    return this.page.getByText('Insights con IA')
  }

  /** Sección de alumnos en riesgo (aparece solo si hay datos) */
  get atRiskSection(): Locator {
    return this.page.getByText('Alumnos en riesgo de abandono')
  }

  /** Sección de membresías por vencer */
  get expiringSoonSection(): Locator {
    return this.page.getByText('Membresías por vencer')
  }

  /** Estado "sin alertas activas" */
  get noAlertsMessage(): Locator {
    return this.page.getByText('Sin alertas activas')
  }
}
