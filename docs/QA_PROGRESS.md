# QA — Progreso general (índice maestro)

> Documento vivo. Única fuente de verdad de qué se probó, qué se corrigió
> y qué falta — no depender de memoria de conversación (se pierde en
> compactaciones/cortes). Se actualiza al cerrar cada módulo, antes de
> pasar al siguiente. Fecha de inicio: 2026-10-05.

## Cómo usar este documento
- Antes de empezar un módulo nuevo: marcar `en progreso` acá.
- Al cerrar un módulo: marcar `hecho`, linkear su doc de detalle (o la
  sección correspondiente si no amerita doc propio), y resumir hallazgos
  en una línea.
- Si la sesión se corta a mitad de un módulo, este doc dice exactamente
  dónde retomar.

## Orden acordado con Cristian (2026-10-07)
1. ~~Mobile (asistencia, reservas, waitlist, mover alumno)~~ — hecho
2. ~~Fintoc (conciliación + Fintoc Pay)~~ — hecho
3. ~~WODs~~ — hecho
4. ~~alumno-api~~ — hecho
5. ~~comunicaciones~~ — hecho
6. ~~configuracion~~ — hecho
7. ~~dashboard~~ — hecho
8. **Producción**: montar un QA real completo contra un gym en Railway
   (no local) — siguiente, ver `docs/PLAN_DE_PRUEBAS_PRODUCCION.md`
9. git: armar PRs de todo lo acumulado y mergear

## Estado por módulo (charters en `qa/charters/`)

| # | Módulo | Estado | Doc / hallazgos | Notas |
|---|---|---|---|---|
| - | Mobile (clases, asistencia, waitlist) | ✅ hecho | `docs/QA_MOBILE_MAESTRO.md` | H-MOBILE-01,03,04,05 en master (PR #86/#85). H-MOBILE-06,07,08,09 sin commitear. H-MOBILE-02 (QR/Geo) pendiente, escalado a product-owner, al final de todo |
| - | conciliacion (Fintoc) | ✅ hecho | `docs/QA_PAGOS_FINTOC.md` | H-PAGOS-01,02,04 corregidos sin commitear. H-PAGOS-03 (desconectar Fintoc) backlog confirmado |
| - | wods | ✅ hecho | `docs/QA_WODS.md` | H-WODS-01,02,03 corregidos sin commitear |
| - | alumno-api | ✅ hecho | `docs/QA_ALUMNO_API.md` | H-ALUMNO-01 (solapamiento de horario) corregido en `bookClass` y `assignUserToClass` |
| - | comunicaciones | ✅ hecho | `docs/QA_COMUNICACIONES.md` | H-COM-01 (sin conteo de destinatarios) y H-COM-02 (HTML sin escapar en emails) corregidos |
| - | configuracion | ✅ hecho | `docs/QA_CONFIGURACION.md` | Sin hallazgos — módulo sólido (validaciones, secretos enmascarados, dedupe, anti-spoofing ya bien construidos) |
| - | dashboard | ✅ hecho | `docs/QA_DASHBOARD.md` | H-DASH-01 corregido (todo el dashboard quedaba un día adelantado con navegador en otra zona horaria) |
| - | **Producción (gym real en Railway)** | ⬜ siguiente | `docs/PLAN_DE_PRUEBAS_PRODUCCION.md` | QA completo contra producción real, no local |
| - | alumnos | ⬜ sin agendar | — | `/dashboard/users`, `/dashboard/staff`. Buena cobertura previa (45 tests) |
| - | auth | ⬜ sin agendar | — | Login/sesión/roles. Buena cobertura previa (39 tests) |
| - | clases (web) | 🟡 parcial | — | Tocamos `ClassDetail` (mover alumno) a fondo; falta crear clases, importar, class-types |
| - | pagos (transferencias) | ⬜ sin agendar | — | `/dashboard/payments` — distinto de Fintoc, no tocado |
| - | planes | ⬜ sin agendar | — | `/dashboard/plans`. Buena cobertura previa (49 tests) |
| - | reportes | ⬜ sin agendar | — | `/dashboard/reports`, `/dashboard/evolution` |
| - | seguridad | ⬜ sin agendar | — | Transversal, multi-tenant con curl. Buena cobertura previa (24 tests) |
| - | superadmin | ⬜ sin agendar | — | `/superadmin/*`, sedes. Buena cobertura previa (41 tests) |
| - | 8 pasarelas de cobro (Stripe, MP, Khipu, Flow, PayU, Kushki, OpenPay, MACH) | ⬜ backlog explícito | — | Cristian las dejó para después de Fintoc, sin fecha |

**"sin agendar"** = no están en el orden que pediste, no las voy a tocar
sin que lo pidas — quedan listadas para que no se pierdan de vista, no
como compromiso.

## Estado de git (al 2026-10-07, tras cerrar los 4 módulos)

Nada commiteado todavía. Acumulado sin tocar git, a la espera de armar
el lote (`git status --short`):
- `apps/api/src/lib/email.ts` + `__tests__/email.test.ts` (H-COM-02)
- `apps/api/src/modules/classes/classes.service.ts` +
  `__tests__/bookings.integration.test.ts` (H-ALUMNO-01)
- `apps/mobile/src/screens/admin/AdminClassesScreen.tsx` (H-MOBILE-09)
- `apps/mobile/src/screens/PlanesScreen.tsx` (H-PAGOS-04)
- `apps/web/app/login/page.tsx` (H-PAGOS-01/02)
- `apps/web/app/dashboard/communications/page.tsx` (H-COM-01)
- `apps/web/app/dashboard/page.tsx` (H-DASH-01)
- `apps/web/app/dashboard/wods/[id]/leaderboard/page.tsx` (H-WODS-01)
- `apps/web/app/dashboard/wods/import/page.tsx` (H-WODS-03)
- `apps/web/app/dashboard/wods/tv/page.tsx` (H-WODS-02)
- `apps/web/e2e/modules/dashboard.spec.ts` +
  `apps/web/e2e/modules/wods.spec.ts` (tests nuevos + limpieza de
  comentarios obsoletos)
- Docs nuevos: `QA_ALUMNO_API.md`, `QA_COMUNICACIONES.md`,
  `QA_CONFIGURACION.md`, `QA_DASHBOARD.md`, `QA_PAGOS_FINTOC.md`,
  `QA_WODS.md`, este índice
- PRs abiertos sin mergear (confirmado con `gh pr list`, 2026-10-07): **#87**
  (mobile, coach quita alumnos de clase — H-MOBILE-08) y **#88** (fix de
  seguridad, dependencias). Mergeados antes de esto, sin relación: #79-86.

`apps/mobile/src/lib/api.ts` sigue modificado (IP local del emulador) —
nunca se commitea, es de siempre.
