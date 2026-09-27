/**
 * global.setup.ts
 *
 * Se ejecuta UNA VEZ antes de todos los tests E2E (proyecto "setup").
 * Objetivos:
 *   1. Hacer login con las credenciales de admin de test.
 *   2. Guardar el storageState (localStorage + cookies) en playwright/.auth/admin.json
 *      para que todos los tests del proyecto "chromium" empiecen ya autenticados.
 *
 * Credenciales de test:
 *   Las credenciales provienen de variables de entorno o de valores hardcodeados
 *   que coinciden con el seed de la DB de desarrollo.
 *
 *   E2E_GYM_SLUG     — slug del gym (default: "crossfit-test")
 *   E2E_ADMIN_EMAIL  — email del admin (default: "admin@test.com")
 *   E2E_ADMIN_PASSWORD — password (default: "Admin1234!")
 *
 * Si el login falla el setup lanza un error claro para que CI no ejecute tests sin auth.
 */
import { test as setup, expect } from '@playwright/test'

const GYM_SLUG = process.env.E2E_GYM_SLUG ?? ''
const EMAIL    = process.env.E2E_ADMIN_EMAIL ?? 'admin@test.com'
const PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? 'Admin1234!'

const AUTH_FILE = 'playwright/.auth/admin.json'

setup('autenticar admin y guardar estado', async ({ page }) => {
  // Navegar a login
  await page.goto('/login')
  await expect(page).toHaveURL(/\/login/)

  // Rellenar formulario.
  // Nota: los labels de login NO tienen atributo `for` conectado a los inputs,
  // por lo que getByLabel() no funciona. Usamos placeholder como selector estable.
  if (GYM_SLUG) {
    await page.getByPlaceholder('mi-gimnasio').fill(GYM_SLUG)
  }
  await page.getByPlaceholder(/admin@/i).fill(EMAIL)
  await page.getByPlaceholder('••••••••').fill(PASSWORD)
  await page.getByRole('button', { name: /iniciar sesión/i }).click()

  // Esperar redirección a /dashboard (o /superadmin para SUPER_ADMIN)
  await page.waitForURL(/\/(dashboard|superadmin)/, { timeout: 15_000 })

  // Verificar que el JWT quedó en localStorage
  const token = await page.evaluate(() => localStorage.getItem('fitapp_token'))
  if (!token) {
    throw new Error(
      'Login exitoso pero no hay token en localStorage. ' +
      'Verifica que la API esté corriendo en :3001 y las credenciales sean correctas.'
    )
  }

  // Guardar estado para reutilizar en todos los tests
  await page.context().storageState({ path: AUTH_FILE })
  console.log(`[setup] Auth guardada en ${AUTH_FILE} (usuario: ${EMAIL})`)
})
