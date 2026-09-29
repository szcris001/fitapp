---
name: testing_e2e_parallel_env_gotchas
description: Gotchas de la suite Playwright (apps/web/e2e) al correr varios agentes QA a la vez: rate limit 429, wizard de onboarding, route.fetch y multipart, restauración en finally
metadata:
  type: project
---

Hallazgos al correr la suite E2E con 4 agentes en paralelo (2026-09-29).

- **Rate limit global de la API: 120 req/min por IP** (`apps/api/src/index.ts`, @fastify/rate-limit). Todos los agentes salen de 127.0.0.1 → 429 masivos. La web traga los 429 en silencio y muestra estados vacíos ("No hay pagos registrados aún", sidebar "FitApp"), que parecen bugs y no lo son. Mis specs (settings/reports/superadmin/security) reintentan GET vía `page.route` respetando `Retry-After` + `test.slow()`. Pedido pendiente: un env var para subir el límite en QA.
- **Wizard de onboarding tapa la página** si `/class-types` o `/plans` fallan (el layout los trata como `[]` → "gym nuevo"). Se evita con `addInitScript(() => localStorage.setItem('fitapp_onboarding_done','1'))`.
- **`route.fetch()` de Playwright no reenvía bien multipart**: el logo subido quedaba de 0 bytes. Interceptar solo GET (`route.fallback()` para el resto).
- **`login()` de support/qa.ts lanza si /auth/login da 429** → un `finally` que restaura datos con `api()` puede no ejecutarse. Envolver con retry que capture el throw.
- Otros agentes crean alumnos/confirman pagos en paralelo: no afirmar totales exactos (miembros, revenue); comparar contra la API en el momento o con `>=`.
- `test-results/` es compartido: otro agente puede borrar tus screenshots; revisar apenas falla.

**How to apply:** reutilizar el bloque "Entorno compartido" de apps/web/e2e/modules/security.spec.ts en specs nuevos hasta que exista un helper compartido en support/qa.ts.
