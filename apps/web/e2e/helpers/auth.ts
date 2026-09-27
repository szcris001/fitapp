/**
 * helpers/auth.ts
 *
 * Autenticación para tests E2E en FitHub.
 *
 * Contexto técnico y solución definitiva:
 *
 * Race condition en las páginas del dashboard:
 *   useEffect(() => { loadFromStorage() }, [])                    // A: carga user
 *   useEffect(() => { if (!user) router.push('/login') }, [user]) // B: chequea user
 *
 * Cuando se llega via page.goto() (hard navigation), el store de Zustand inicia con
 * user=null. El efecto B se dispara con user=null y redirige a /login.
 *
 * Cuando se llega via SPA navigation (router.push), el store PERMANECE en memoria.
 * user != null. El efecto B no redirige.
 *
 * Solución validada con diagnóstico:
 * 1. Login UI → router.push('/dashboard') → store tiene user.
 * 2. Esperar que el dashboard cargue (contenido visible).
 * 3. Click en el button de quick access o sidebar correspondiente (SPA navigation).
 * 4. La nueva página recibe el store con user != null → no hay race condition.
 *
 * Mapeo validado (ver diagnóstico):
 * - Sidebar: Inicio, Alumnos, Clases, Planes, Conciliacion, Reportes, Comunicación, Configuración
 * - Quick access: Registrar pago, Ver reportes, Alertas IA, Comunicación, Gestionar WODs
 */
import { type Page } from '@playwright/test'

const GYM_SLUG = process.env.E2E_GYM_SLUG ?? ''
const EMAIL    = process.env.E2E_ADMIN_EMAIL ?? 'e2e-admin@fitapp.test'
const PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? 'E2eAdmin123!'

/** Hace login UI y espera que el dashboard cargue con contenido (sidebar visible). */
async function loginAndWaitForDashboard(page: Page): Promise<void> {
  await page.goto('/login')
  await page.waitForSelector('button[type="submit"]', { timeout: 10_000 })

  if (GYM_SLUG) {
    await page.getByPlaceholder('mi-gimnasio').fill(GYM_SLUG)
  }
  await page.getByPlaceholder(/admin@/i).fill(EMAIL)
  await page.getByPlaceholder('••••••••').fill(PASSWORD)
  await page.getByRole('button', { name: /iniciar sesión/i }).click()

  // Esperar redirección al dashboard
  await page.waitForURL(/\/dashboard/, { timeout: 15_000 })

  // Esperar que el sidebar esté renderizado (al menos uno de sus items visible)
  // Esto garantiza que el dashboard cargó y el store está hidratado
  await page.waitForSelector('button:has-text("Inicio")', { timeout: 12_000 })
}

/**
 * Navega a la URL destino garantizando autenticación via login UI + SPA navigation.
 *
 * Estrategia:
 * 1. Login UI → store hidratado sincrónicamente.
 * 2. Esperar que el dashboard esté completamente renderizado.
 * 3. Click en el sidebar/quick-access button correspondiente (SPA navigation).
 * 4. El store permanece en memoria → user != null en la nueva página.
 *
 * Fallback: page.goto() directo si no hay handler en el mapa.
 */
export async function navigateTo(page: Page, url: string): Promise<void> {
  // Login UI + espera del dashboard
  await loginAndWaitForDashboard(page)

  if (url === '/dashboard') return

  // Mapa de URL a button visible en el dashboard
  // Prioriza sidebar (siempre visible), luego quick access (visible si el dashboard cargó)
  const sidebarLabels: Record<string, RegExp> = {
    '/dashboard/plans':          /^Planes$/i,
    '/dashboard/fintoc':         /^Conciliacion$/i,
    '/dashboard/classes':        /^Clases$/i,
    '/dashboard/users':          /^Alumnos$/i,
    '/dashboard/reports':        /^Reportes$/i,
    '/dashboard/communications': /^Comunicación$/i,
  }

  const quickAccessLabels: Record<string, RegExp> = {
    '/dashboard/alerts':         /^Alertas IA$/i,
    '/dashboard/reports':        /^Ver reportes$/i,
    '/dashboard/communications': /^Comunicación$/i,
  }

  // Intentar click en sidebar
  const sidebarRegex = sidebarLabels[url]
  if (sidebarRegex) {
    await page.getByRole('button', { name: sidebarRegex }).click()
    await page.waitForURL(new RegExp(url.replace(/\//g, '\\/')), { timeout: 10_000 })
    return
  }

  // Intentar click en quick access del dashboard
  const quickRegex = quickAccessLabels[url]
  if (quickRegex) {
    await page.getByRole('button', { name: quickRegex }).click()
    await page.waitForURL(new RegExp(url.replace(/\//g, '\\/')), { timeout: 10_000 })
    return
  }

  // Para /dashboard/settings y sus sub-rutas
  if (url.startsWith('/dashboard/settings') || url === '/dashboard/staff') {
    const settingsMap: Record<string, RegExp> = {
      '/dashboard/settings':                       /^Mi Centro$/i,
      '/dashboard/settings/class-types':           /^Tipos de clase$/i,
      '/dashboard/staff':                          /^Personal$/i,
      '/dashboard/settings/email-templates':       /^Plantillas correo$/i,
      '/dashboard/settings/movements':             /^Movimientos$/i,
    }

    // Hover en Configuración para abrir el popup
    const configBtn = page.getByRole('button', { name: /^Configuración$/i })
    await configBtn.hover()

    // El popup tarda ~120ms en aparecer (closeTimer en el layout)
    await page.waitForTimeout(300)

    // Para /dashboard/settings/class-types/import, navegar a class-types primero
    const mappingKey = url === '/dashboard/settings/class-types/import'
      ? '/dashboard/settings/class-types'
      : url

    const subRegex = settingsMap[mappingKey]
    if (subRegex) {
      const subBtn = page.getByRole('button', { name: subRegex })
      await subBtn.click()
      await page.waitForURL(new RegExp(mappingKey.replace(/\//g, '\\/')), { timeout: 10_000 })

      // Para /import, hacer click en el link de importar
      if (url === '/dashboard/settings/class-types/import') {
        const importLink = page.getByRole('link', { name: /importar/i }).first()
        await importLink.click()
        await page.waitForURL(/\/import/, { timeout: 8_000 })
      }
      return
    }
  }

  // Fallback: page.goto() directo
  // (puede tener race condition, pero es el último recurso)
  await page.goto(url)
  await page.waitForLoadState('domcontentloaded', { timeout: 10_000 })
}
