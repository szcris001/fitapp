---
name: project_benchmark_history_unified
description: Diseño + implementación del historial unificado de benchmarks (clase + personal) aprobado e implementado 2026-10-19 — getBenchmarkHistory, GET /benchmarks/history/me, sin cambios de esquema
metadata:
  type: project
---

# Historial unificado de benchmarks del alumno (clase + personal) — 2026-10-19

## Contexto

Mismo día que [[project_wod_benchmark_link]] (conectar Benchmark↔Wod), Cristian
pidió resolver el gap que ese diseño dejó anotado a propósito: dos vías de
carga de benchmarks conviven y deben verse juntas, distinguidas por origen:

- **"class"**: `WodResult` cuyo `wod.benchmarkId` no es null — el alumno hizo
  el benchmark en una clase programada. Ya modelado por el diseño anterior.
- **"personal"**: `BenchmarkResult` vía `POST /benchmarks/:id/result` — el
  alumno lo cargó por su cuenta, sin clase. Camino viejo que nunca se
  desconectó, sigue alimentando la Pizarra/TV (`/benchmarks/board`,
  `/benchmarks/:id/leaderboard`, que NO se tocaron en este pase).

Ojo: esto es distinto del Board/TV del gym (ranking agregado, coach/admin-only)
— ese gap (Board/TV solo lee `BenchmarkResult`, no ve clase) sigue sin
resolverse a propósito, no fue lo pedido esta vez.

## Decisión: merge de lectura en memoria, sin tocar esquema

Nueva función `getBenchmarkHistory(gymId: string, userId: string)` en
`apps/api/src/modules/analytics/benchmark.service.ts` (archivo nuevo — el
módulo `benchmark.routes.ts` no tenía service, violaba "lógica fuera de
routes"; aprovechado para corregirlo).

Patrón: dos queries en paralelo (`WodResult` con `wod.benchmarkId != null`,
incluyendo `wod.{date, scoreType, benchmark}`; `BenchmarkResult` del user,
incluyendo `benchmark`), normalizar cada fila a un shape común, concatenar y
`.sort by date desc`. Mismo espíritu que `calculateConsistency` /
`awardSemesterPillarsForGym` (cruzan Booking+Wod+WodResult sin N+1) — ya es
el patrón establecido del repo para combinar fuentes heterogéneas del lado
del servidor, no hubo que inventar uno nuevo.

**Por qué NO una tabla/vista nueva**: ninguna de las dos tablas es dueña del
dato de la otra, ambas son per-user y ya existen con RLS correcto. Crear una
tercera tabla para "historial unificado" sería duplicar estado que ya vive en
dos lados — puro riesgo de desincronización sin ganar nada (no hay volumen que
lo justifique: historial por alumno, no agregados de todo el gym).

## Shape de cada entrada (contrato, no cambiarlo sin avisar a quien consuma)

```ts
{
  id: string              // 'class_<wodResultId>' | 'personal_<benchmarkResultId>'
  source: 'class' | 'personal'
  benchmarkId: string
  benchmarkName: string
  benchmarkCategory: string   // BenchmarkCategory: GIRL|HERO|OPEN|GAMES|CUSTOM
  date: Date               // wod.date (class) o recordedAt (personal)
  score: number            // mismas unidades en ambas fuentes (ver nota abajo)
  scoreText: string | null
  scoreFormatted: string   // formatScore(score, scoreText, scoreType) — mismo por las dos fuentes
  rx: boolean
}
```

El prefijo `class_`/`personal_` en `id` es a propósito: dos tablas distintas,
nunca van a colisionar sus uuid, pero así el cliente (web/mobile) tiene una
key de lista lista para usar sin tener que concatenar `source+id` él mismo.

**Nota sobre scoreType, la revisé a fondo porque no era obvio que calzaran**:
`Wod.scoreType` es el enum `WodScoreType` (TIME|REPS|WEIGHT|ROUNDS|CUSTOM).
`BenchmarkResult.scoreType` es un `String` suelto pero con el mismo
vocabulario exacto (confirmado por el comentario en `schema.prisma` línea
~509) y las mismas unidades (segundos para TIME, kg para WEIGHT — confirmado
leyendo los comentarios de ambos endpoints de registro). Por eso
`formatScore` (ya exportado desde `wod.service.ts`, moví su uso pero no su
definición) sirve para las dos fuentes sin normalizar nada más. Si algún día
se agrega un `scoreType` nuevo a una tabla y no a la otra, hay que revisar
`formatScore` de nuevo — hoy están sincronizados pero no hay ningún tipo
compartido (enum vs string) que lo garantice a futuro.

## Dónde se consume

- `users.service.ts getUserById` (web, ficha del alumno): su `benchmarkHistory`
  (que antes solo era `WodResult` con benchmark, ver diseño anterior) ahora
  llama a `getBenchmarkHistory` — cambio additivo y retrocompatible, los campos
  que ya leía `apps/web/app/dashboard/users/[id]/page.tsx` (`r.id`,
  `r.benchmarkName`, `r.rx`, `r.scoreFormatted`, `r.date`) siguen iguales, solo
  gana `source`.
- `GET /benchmarks/history/me` (`authenticate`, nuevo endpoint en
  `benchmark.routes.ts`): para mobile. Deliberadamente **no reemplaza**
  `GET /wod-results/me` — ese endpoint es "todos mis resultados de WOD, con
  rank, con o sin benchmark", un concepto más amplio (lo usa el tab
  "Resultados" de `ProgressScreen.tsx`, que muestra WODs normales también).
  Mezclar ahí hubiera perdido el rank/leaderboard-context que ese endpoint ya
  da. El historial de benchmarks es un concepto más angosto, natural para
  vivir en `BenchmarksScreen.tsx` (hoy huérfana, sin cablear a
  `AppNavigator.tsx` — eso lo hace Cristian en modo directo).

## Qué NO se tocó (fuera de alcance, confirmado con Cristian)

- Cablear `BenchmarksScreen.tsx` a `AppNavigator.tsx`.
- Diseño visual del badge "en clase" / "por tu cuenta" en la UI.
- El Board/TV (`GET /benchmarks/board`, `/benchmarks/:id/leaderboard`) sigue
  leyendo solo `BenchmarkResult` — es un gap distinto (ranking agregado del
  gym, no historial personal). Si se pide, diseñar ahí mismo.

## Archivos tocados

- `apps/api/src/modules/analytics/benchmark.service.ts` (NUEVO) —
  `getBenchmarkHistory`.
- `apps/api/src/modules/analytics/benchmark.routes.ts` — import +
  `GET /benchmarks/history/me`.
- `apps/api/src/modules/users/users.service.ts` — `getUserById` usa
  `getBenchmarkHistory` en vez de su query inline; se quitó el include
  `wodResults` y el import de `formatScore` (ya no se usa directo ahí).
- `apps/api/src/modules/analytics/__tests__/benchmark-history.integration.test.ts`
  (NUEVO) — 5 tests: merge+orden+source, aislamiento cross-gym/user, lista
  vacía, 401 sin token, 200 con ambas fuentes vía el endpoint.
- Suite completa verificada: 1203/1203 verdes (era 1198 antes de este pase),
  sin regresiones. `tsc --noEmit` limpio.

Ver también [[project_wod_benchmark_link]] (diseño del que este es
continuación directa, mismo día) y [[project_patterns]] (patrón de módulo
self-contained — este pase le agregó el service que le faltaba a
`benchmark.routes.ts`).
