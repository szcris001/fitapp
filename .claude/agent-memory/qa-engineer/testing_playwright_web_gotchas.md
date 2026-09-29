---
name: testing-playwright-web-gotchas
description: Gotchas de la suite Playwright web (apps/web/e2e/modules): rate limit global 429 con agentes en paralelo, formato hora es-CL, labels sin htmlFor, email del admin en sidebar, planes ordenados por precio
metadata:
  type: project
---

Hallazgos al escribir dashboard/users/plans.spec.ts (2026-09-29):

- **Rate limit global de la API: 120 req/min por IP** (apps/api/src/index.ts). Con varios agentes/specs
  en paralelo contra localhost se dispara 429 y la web se ve "vacía" (marca por defecto "FitHub",
  wizard de onboarding, listas vacías) — parece bug pero no lo es. Revisar screenshot; esperar con
  `until [ "$(curl -s -o /dev/null -w '%{http_code}' localhost:3001/api/plans)" != "429" ]`.
  Login además tiene authRateLimit 50/15 min (dev): no gastar logins en limpieza.
- test-results/ es compartido entre agentes: usar `--output=<scratchpad>` para no perder screenshots.
- Chromium con locale es-CL formatea horas como «07:00 a. m.» (no «07:00»).
- Formularios del panel no usan htmlFor: getByLabel no sirve; usar xpath
  `//label[normalize-space()="X"]/following-sibling::*[self::input or self::select][1]`.
- El sidebar muestra el email del usuario logueado: acotar búsquedas de emails a `getByRole('table')`.
- GET /plans lista solo activos ordenados por priceCents asc; el primero se preselecciona en los
  modales de pago → desactivar (DELETE /plans/:id) todo plan creado por tests.
- No existe DELETE /users/:id para admin; alumnos de test quedan, desactivar sus membresías (PATCH
  /memberships/:id {status:'INACTIVE'}) para no inflar KPIs (en riesgo, activos, ingresos).

**Why:** varios fallos iniciales fueron ambientales (429) y no bugs; costó diagnosticarlo.
**How to apply:** ante páginas vacías en E2E, sospechar 429 antes de reportar bug. Ver [[testing-setup-missing]].
