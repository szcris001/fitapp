import { type Page, type Locator, expect } from '@playwright/test'

/**
 * Page Object para /login
 * Encapsula la interacción con el formulario de login.
 */
export class LoginPage {
  readonly page: Page
  readonly gymSlugInput: Locator
  readonly emailInput: Locator
  readonly passwordInput: Locator
  readonly submitButton: Locator
  readonly errorMessage: Locator

  constructor(page: Page) {
    this.page = page
    // Los labels de login NO tienen atributo `for` enlazado a los inputs
    // (ver apps/web/app/login/page.tsx — los labels son divs inline sin for=).
    // Usamos placeholder como selector estable.
    this.gymSlugInput  = page.getByPlaceholder('mi-gimnasio')
    this.emailInput    = page.getByPlaceholder(/admin@/i)
    this.passwordInput = page.getByPlaceholder('••••••••')
    this.submitButton  = page.getByRole('button', { name: /iniciar sesión/i })
    // El div de error muestra el mensaje de la API (ej: "Credenciales incorrectas")
    this.errorMessage  = page.locator('div').filter({ hasText: /credenciales/i }).first()
  }

  async goto() {
    await this.page.goto('/login')
    await expect(this.page).toHaveURL(/\/login/)
  }

  async login(email: string, password: string, gymSlug?: string) {
    if (gymSlug) await this.gymSlugInput.fill(gymSlug)
    await this.emailInput.fill(email)
    await this.passwordInput.fill(password)
    await this.submitButton.click()
  }

  async loginAndWaitForDashboard(email: string, password: string, gymSlug?: string) {
    await this.login(email, password, gymSlug)
    await this.page.waitForURL(/\/(dashboard|superadmin)/, { timeout: 15_000 })
  }
}
