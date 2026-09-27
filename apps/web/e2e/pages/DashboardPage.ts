import { type Page, type Locator, expect } from '@playwright/test'

/**
 * Page Object para /dashboard
 * Encapsula la verificación de métricas y navegación.
 */
export class DashboardPage {
  readonly page: Page

  constructor(page: Page) {
    this.page = page
  }

  async goto() {
    await this.page.goto('/dashboard')
    await expect(this.page).toHaveURL(/\/dashboard/)
  }

  async waitForLoad() {
    // Esperar a que desaparezca el skeleton de carga
    await this.page.waitForFunction(
      () => !document.body.textContent?.includes('Cargando dashboard'),
      { timeout: 12_000 },
    )
  }

  /** KPI strip — card del total de alumnos */
  get totalAlumnosCard(): Locator {
    return this.page.getByText('Total alumnos')
  }

  /** KPI strip — card de alumnos activos */
  get alumnosActivosCard(): Locator {
    return this.page.getByText('Alumnos activos')
  }

  /** Sección de clases del día */
  get proximasClasesHeading(): Locator {
    return this.page.getByText('Próximas clases')
  }

  /** Sección de ocupación */
  get ocupacionHeading(): Locator {
    return this.page.getByText('Ocupación de clases')
  }

  /** Botón "Registrar pago" en el header */
  get registrarPagoButton(): Locator {
    return this.page.getByRole('button', { name: /registrar pago/i })
  }

  /** Enlace "Alertas IA" en acceso rápido */
  get alertasIALink(): Locator {
    return this.page.getByText('Alertas IA')
  }

  /** Nav sidebar — link a Planes */
  get planesNavLink(): Locator {
    return this.page.getByRole('link', { name: /planes/i }).first()
  }

  /** Nav sidebar — link a Conciliacion */
  get conciliacionNavLink(): Locator {
    return this.page.getByRole('link', { name: /conciliaci/i }).first()
  }
}
