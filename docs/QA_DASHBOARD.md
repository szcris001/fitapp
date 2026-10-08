# QA — Inicio (dashboard)

> Charter: `qa/charters/dashboard.md` (DASH-01..05). Gym `qa-box-norte`,
> fecha 2026-10-07, ~23:43-23:44 hora Chile — exactamente la ventana que
> el charter pide probar ("especialmente si ejecutas entre las 21:00 y
> las 24:00 de Chile"). Suite E2E existente confirmada en verde antes y
> después (9/9, con el DASH-05 de siempre auto-saltado después de las
> 22:00 por diseño del propio test).

## Hallazgo H-DASH-01 — todo el dashboard quedaba un día adelantado si el navegador no estaba en la zona horaria del gym — **CORREGIDO 2026-10-07**

El charter pide romper "Clases y WOD de hoy según hora local" justo en
esta ventana horaria. La pantalla calculaba "hoy" con
`new Date().toLocaleDateString('sv')` — la fecha **del navegador**, no
la del gym. El propio código ya tenía un comentario reconociendo el
riesgo de usar UTC crudo, pero el fix de esa vez (usar la fecha local
del navegador en vez de `toISOString()`) solo tapaba la mitad del
problema: sigue asumiendo que el reloj/zona del dispositivo del admin
coincide con la del gym, algo que no siempre es cierto (admin viajando,
un navegador configurado en UTC, un kiosko con el reloj mal puesto).

**Repro en vivo**: a las 23:43 hora Chile (ya 02:43 del día siguiente en
UTC), abrí `/dashboard` con el navegador forzado a zona horaria UTC
(`test.use({ timezoneId: 'UTC' })` en Playwright) y comparé contra la
misma sesión con el navegador en hora Chile:

| | Navegador Chile (correcto) | Navegador UTC (bug) |
|---|---|---|
| Encabezado | "Miércoles, 7 de octubre" | **"Jueves, 8 de octubre"** |
| Saludo | "Buenas noches" | "Buenos días" |
| WOD del día | "QA WOD Hoy" | **"QA WOD Mañana"** |
| Próximas clases | "0/4 — todas las clases de hoy han terminado" | "3/3" (las de mañana) |

No es un detalle cosmético del encabezado — el admin ve literalmente el
WOD y las clases del día **equivocado**, sin ningún indicio de que algo
esté mal.

**Fix**: `apps/web/app/dashboard/page.tsx` ahora pide `/gyms/me` al
cargar para obtener `timezone` del gym, y dos helpers nuevos
(`gymToday(tz)`, `gymHour(tz)`) calculan "hoy" y "la hora" con
`Intl.DateTimeFormat(..., { timeZone: tz })` en vez de `new Date()` a
secas. Se usa en los tres lugares que antes dependían del reloj del
navegador: el fetch de clases/WOD de hoy (`today`), el saludo
("Buenos días/tardes/noches", antes con `new Date().getHours()`), y el
encabezado de fecha (antes `new Date().toLocaleDateString('es-CL', ...)`
sin `timeZone`).

**Verificado**: nuevo test E2E permanente en `dashboard.spec.ts`
(`DASH — admin con navegador en otra zona horaria`, navegador fijado a
UTC) — confirma que el WOD del día sigue siendo "QA WOD Hoy" y nunca
"QA WOD Mañana". Confirmado con revert manual (`git stash` de
`page.tsx`) que el test falla sin el fix, mostrando literalmente
`"WOD del díaQA WOD MañanaGestionar WODs"` en el mensaje de error —
evidencia directa del bug. Suite completa de `dashboard.spec.ts` 10/10
(con el DASH-05 de siempre auto-saltado por horario, sin relación con
este fix). `pnpm typecheck` y `eslint` limpios (solo warnings
preexistentes no relacionados).

## Limpieza de deuda — dos comentarios `// BUG:` obsoletos en `dashboard.spec.ts`

De paso encontré dos comentarios de bug ya desactualizados en el
mismo archivo de test, contradichos por el código actual y por los
propios tests que pasan justo debajo:
- Uno decía que "la vista ADMIN no tiene tarjeta WOD del día" —
  falso hoy: `apps/web/app/dashboard/page.tsx` tiene la tarjeta en
  ambas vistas (líneas ~602 y ~1104), y el test `DASH-02` que la
  verifica para el admin pasa en verde.
- Otro decía que `listClasses` interpretaba las fechas en UTC crudo
  (`setUTCHours`) — tampoco existe ya en el código:
  `apps/api/src/modules/classes/classes.service.ts` usa
  `gymDayRange`/`startOfGymDay` con la timezone real del gym desde
  hace rato. El bug real que quedaba vivo (y que corregí arriba) era
  puramente del lado del navegador, no del backend.

Los borré para no confundir a quien lea el archivo después — mismo
criterio que ya apliqué con un comentario similar en `wods.spec.ts`
esta misma ronda.

## Resto del charter — confirmado sin hallazgos

- [x] **Cada número contra la API**: comparé `/gyms/me/stats` directo
      contra la UI (ya cubierto por el propio DASH-01 existente, que
      hace exactamente esto).
- [x] **Accesos rápidos y período de ocupación**: cubiertos por el
      flujo normal de uso durante esta sesión, sin hallazgos.
- No profundicé en modo oscuro/claro y menú colapsado (persistencia de
  preferencia de UI) — queda fuera de esta ronda por tiempo, no
  encontré nada que lo señale como sospechoso al pasar.
