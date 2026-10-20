---
name: crossfit-knowledge
description: Conocimiento de CrossFit necesario para tocar WODs, benchmarks o el guardado de resultados de los alumnos — qué significa cada formato (For Time, AMRAP, EMOM, Tabata, Max Reps), cómo se puntúa cada uno, y cómo eso mapea al WodScoreType de este repo. Cargar antes de tocar wod.service.ts, benchmark.service.ts/routes.ts, el editor de WOD (ClassDetail.tsx) o cualquier pantalla donde el alumno carga un resultado.
---

# CrossFit — lo que hay que entender antes de tocar resultados

Sin esto, cualquier cambio a cómo se guarda o se puntúa un resultado puede
quedar matemáticamente mal (ej. ordenar un ranking al revés, o comparar
cosas que no son comparables). Pedido explícito de Cristian (2026-10-20):
"si no comprendes el crossfit no podrás ayudarme a crear sus resultados
para los alumnos".

## Los formatos y cómo se puntúan

Un WOD (Workout of the Day) se puntúa de una sola forma declarada de
antemano — nunca se mezclan dos criterios en el mismo resultado. Los
formatos reales que existen en el catálogo de 113 benchmarks sembrados
(`apps/api/prisma/seed.ts`, campo `formato`, vocabulario cerrado de 5
valores) y cómo se puntúa cada uno:

| `formato` (benchmark) | Qué es | Cómo se puntúa | Mejor resultado | `WodScoreType` |
|---|---|---|---|---|
| **For Time** (59 de 113) | Trabajo prescrito fijo (reps/rondas exactas) — el atleta lo completa lo más rápido posible. Ej. Fran: 21-15-9 Thrusters+Pull-ups. | Tiempo transcurrido hasta terminar. Si no termina en el timecap, se anota como tiempo + reps faltantes (no se guarda como número comparable sin más contexto). | **Menor** tiempo | `TIME` |
| **AMRAP** (51 de 113) — As Many Rounds As Possible | Tiempo fijo, se hacen tantas rondas/reps como se pueda. Ej. Cindy: AMRAP 20min de 5 Pull-ups+10 Push-ups+15 Air Squats. | Rondas completas + reps extra de la ronda incompleta (ej. "14 rondas + 7 reps"). Para comparar/rankear se normaliza a un número: rondas × reps-por-ronda + reps parciales. | **Mayor** cantidad | `ROUNDS` |
| **Max Reps** (1: Lynne) | Rondas con tope de reps (ej. bench press al peso corporal), sin límite de tiempo por ronda. | Suma total de reps logradas. | **Mayor** reps | `REPS` |
| **Tabata** (1: "Tabata Something Else") | 8 rondas de 20s trabajo / 10s descanso, por movimiento. | El score es la ronda **más floja** (el mínimo, no el total) — mide consistencia, no volumen. Ver `descripcion` del benchmark para el detalle exacto. | **Mayor** reps (de la ronda mínima) | `REPS` |
| **EMOM** (1: Chelsea) — Every Minute On the Minute | Reps fijas prescritas cada minuto, por N minutos. No se "mejora" haciendo más reps — o lo completás en el minuto o no. | Pass/fail por minuto, o "llegó hasta el minuto X antes de fallar". No es un número que se pueda comparar como mayor/menor de forma simple. | — (depende del caso) | `CUSTOM` (usar `scoreText` para describir qué pasó) |

`WodScoreType` (`apps/api/prisma/schema.prisma`) tiene 5 valores:
`TIME | REPS | WEIGHT | ROUNDS | CUSTOM`. `WEIGHT` no aparece en los
benchmarks del catálogo (ningún `formato` lo pide hoy) — se usa para WODs
de clase tipo "1RM" o cargas máximas, que en este repo ya tienen su propio
sistema separado (`RmRecord`, ver `rm.routes.ts`), no benchmarks.

## Dónde importa esto en el código

- `Benchmark.formato` (`apps/api/prisma/schema.prisma`) — el string libre de arriba.
- `Wod.scoreType` — se fija UNA vez al crear/editar el WOD (`POST/PUT /wods`), determina cómo se interpreta `WodResult.score` de todos los alumnos que lo corran.
- `apps/web/app/dashboard/classes/_components/ClassDetail.tsx`, función `applyBenchmark()` — cuando el coach aplica un benchmark del catálogo al crear un WOD, **debe setear `form.scoreType` según la tabla de arriba**, no dejarlo en lo que estaba antes. Sin esto, el alumno carga su tiempo de "Fran" y el sistema lo trata como REPS (mayor=mejor) en vez de TIME (menor=mejor) — el ranking queda invertido.
- `formatScore()` (`apps/api/src/modules/wod/wod.service.ts`) — formatea `score` según `scoreType`: `TIME` → `mm:ss`, `CUSTOM` → usa `scoreText` tal cual, el resto → el número crudo. `ROUNDS`/`REPS`/`WEIGHT` hoy se muestran igual (solo el número) — si se agrega UI real para "rondas + reps" de un AMRAP, revisar si conviene separar `ROUNDS` de `REPS` en el formateo (hoy no hace falta, no hay UI que lo pida).
- `BenchmarkResult.scoreType` — mismo vocabulario pero como string suelto (no enum), ver comentario en el schema.

## Terminología que aparece seguido

- **Rx** ("as prescribed"): el atleta hizo el movimiento/peso exactamente como está escrito en el benchmark (`Benchmark.movimientos[].cargaRxKgHombre/Mujer`). **Scaled**: versión reducida/adaptada (`cargaScaled`, texto libre, ej. "Band assisted o ring rows"). Se guarda como booleano `rx`/`isRx` en los resultados — nunca se mezclan en el mismo ranking (ver `GET /wods/:id/leaderboard`, separa `rxEntries`/`scaledEntries`).
- **Categorías del catálogo** (`BenchmarkCategory`): `GIRL` (nombres de mujer, los benchmarks clásicos de CrossFit.com), `HERO` (nombre de un militar/bombero/policía caído en servicio, suelen ser más largos/duros), `OPEN` (de competencias CrossFit Open pasadas), `GAMES` (de CrossFit Games), `CUSTOM` (creado por el gym, no oficial).
- **Timecap**: tiempo máximo para un "For Time" — si no termina, no hay tiempo real que anotar (ver nota de la tabla).
- **Couplet/triplet**: WOD con 2 o 3 movimientos alternados (no es un campo del modelo, es terminología que puede aparecer en `descripcion`).
