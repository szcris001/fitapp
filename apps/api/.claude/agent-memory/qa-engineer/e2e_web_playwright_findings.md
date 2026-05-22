---
name: E2E Playwright web dashboard FitHub
description: Gotchas críticos y solución a Zustand race condition en tests E2E de Next.js 16 App Router
type: project
---

# E2E Playwright web dashboard FitHub

28/28 tests pasando (2026-05-09). 6 flujos cubiertos.

## Gotcha 1: Zustand race condition (el más importante)

**Problema**: Las páginas del dashboard tienen este patrón:
```javascript
useEffect(() => { loadFromStorage() }, [])          // Efecto A
useEffect(() => {                                    // Efecto B
  if (!user) { router.push('/login'); return }
  fetchData()
}, [user])
```

Cuando se llega via `page.goto()` (hard navigation), Zustand reinicia con `user = null`.
El Efecto B corre en el primer render con `user = null` y redirige a `/login`.
Resultado: `page.goto('/dashboard/alerts')` SIEMPRE redirige a `/login`.

**Solución validada**: login UI + SPA navigation.
- `login()` del store hidrata sincrónicamente el store ANTES de hacer `router.push('/dashboard')`.
- Luego, en el dashboard, hacer click en el button del sidebar o quick access (SPA navigation via `router.push` de Next.js).
- En SPA navigation el Zustand store PERMANECE en memoria → `user != null` en el primer render de la nueva página.
- El Efecto B ve `user != null` → no redirige.

Ver implementación en: `apps/web/e2e/helpers/auth.ts` función `navigateTo()`.

**Why**: Cualquier `page.goto()` a una ruta protegida resetea el módulo JS del store.

**How to apply**: Para todos los tests E2E de páginas protegidas del dashboard: login UI + click en sidebar/quick-access.

## Gotcha 2: Sidebar usa `<button>`, no `<a href>`

Los items del sidebar del DashboardLayout son `<button onClick={() => router.push(href)}>`.
- `getByRole('link', { name: /conciliaci/i })` NO funciona.
- Usar `getByRole('button', { name: /^Conciliacion$/i })`.

Mapa validado:
- "Inicio", "Alumnos", "Clases", "Planes", "Conciliacion", "Reportes", "Comunicación"
- "Configuración" es un popup con sub-items (hover para abrir)
- Quick access del dashboard: "Alertas IA", "Ver reportes", "Gestionar WODs", "Comunicación"

## Gotcha 3: Labels sin `for`/`htmlFor`

Todos los formularios del dashboard usan `<label className="...">Nombre *</label>` sin `htmlFor`.
`getByLabel('Nombre *')` NO funciona.
Usar `getByPlaceholder()` para los inputs:
- Nombre del plan: `getByPlaceholder(/Plan Mensual|Clase de Prueba/i)`
- Precio: `getByPlaceholder('30000')`
- Login slug: `getByPlaceholder('mi-gimnasio')`
- Login email: `getByPlaceholder(/admin@/i)`
- Login password: `getByPlaceholder('••••••••')`

## Gotcha 4: strict mode violation con getByText()

`getByText('Pendientes')` en la página de Fintoc retorna 3 elementos:
- Stat card "Pendientes de revisión"
- Tab button "Pendientes"
- Heading "Pendientes"

Usar `getByRole('button', { name: 'Pendientes' })` para el tab del fintoc.

## Gotcha 5: .env.e2e no se carga automáticamente

Playwright NO lee archivos `.env.*` automáticamente.
Solución: `playwright.config.ts` usa `fs.readFileSync('.env.e2e')` y parsea manualmente.
Variables: `E2E_GYM_SLUG`, `E2E_ADMIN_EMAIL`, `E2E_ADMIN_PASSWORD`.

## Gotcha 6: locator().or() en modo strict

`locator.or()` falla con "strict mode violation" si retorna más de 1 elemento.
Usar `.first()` o ser más específico con el selector antes de hacer assertions.

## Configuración de la suite

- `playwright.config.ts`: loadDotenv vía fs.readFileSync, storageState: 'playwright/.auth/admin.json'
- `global.setup.ts`: login UI, guarda storageState
- `helpers/auth.ts`: navigateTo() via loginUI + SPA navigation
- Test user: `e2e-admin@fitapp.test` / `E2eAdmin123!` / gym slug `e2e-test-gym`
- El setup del test user está documentado en `apps/web/e2e/fixtures/setup-test-data.ts`

## Diagnóstico que confirmó la solución

Script de diagnóstico (`diag.e2e.spec.ts`, luego eliminado) confirmó:
- Login UI llega a /dashboard correctamente
- Después de 3s de espera, el botón "Alertas IA" es visible
- Click en "Alertas IA" navega a `/dashboard/alerts` vía SPA
- El store permanece hidratado durante la SPA navigation
