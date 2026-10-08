# QA — Pizarra (WODs), importación, leaderboard y modo TV

> Charter: `qa/charters/wods.md` (casos WOD-01..05/06). Fecha: 2026-10-07.
> Suite E2E (`apps/web/e2e/modules/wods.spec.ts`) confirmada en verde
> (5/5) antes de empezar: listado con filtros, abrir clase desde el WOD,
> importar Excel, reimportar duplicado, registrar resultado y ver orden.

## Hallazgo H-WODS-01 — el leaderboard no tenía forma de editar ni borrar un resultado — **CORREGIDO 2026-10-07**

El charter pide probar "editar y borrar" en el leaderboard. Revisando
`apps/web/app/dashboard/wods/[id]/leaderboard/page.tsx` (704 líneas):
solo existía `POST /wods/:id/results` (registrar) — ningún botón de
editar ni borrar, en ningún lado de la pantalla.

**El backend ya tenía todo listo, sin usar**: `wod.routes.ts` define
`PUT /wods/:id/results/:userId` y `DELETE /wods/:id/results/:userId`,
ambos detrás de `requireCoachOrAdmin`, con sus validaciones (WOD
pertenece al gym, el resultado existe) ya implementadas — pero sin
ningún test (`grep` en `wod.integration.test.ts`: cero menciones a PUT o
DELETE de resultados) y sin ningún caller, ni en web ni en mobile
(`MemberWodScreen.tsx` en mobile solo tiene el autoreporte del alumno,
`POST /results/me`, tampoco edita/borra). Mismo patrón que ya se repitió
esta ronda con H-MOBILE-02 (QR/Geo) y H-PAGOS-04 (Fintoc Pay): backend
construido, nunca conectado al cliente.

**Fix**: en `leaderboard/page.tsx` —
- `LeaderboardEntry` ahora incluye `userId` y `scoreText` (ya venían del
  backend, solo faltaban en el tipo de TypeScript).
- `RegisterModal` ahora sirve para registrar y editar: con
  `editingEntry` seteado, bloquea la búsqueda de atleta (se muestra el
  nombre, no editable), precarga score/categoría/notas, y llama `PUT`
  en vez de `POST`. Para `TIME` la precarga usa `scoreFormatted`
  (`"5:30"`), que `parseScore` ya sabe interpretar de vuelta.
- Cada fila (`EntryRow`) suma dos botones (lápiz, tacho) visibles solo
  para `canRegister` (ADMIN/COACH/SUPER_ADMIN). Borrar pide confirmación
  (`window.confirm`) antes de llamar `DELETE`.

**Verificado en vivo** (Playwright, WOD de tipo `TIME`, gym QA Norte):
1. Registrar 5:30 para Mara → aparece en el leaderboard.
2. Editar → el modal abre con "Editar resultado", el campo de atleta
   está bloqueado (sin buscador), el score precargado es exactamente
   `5:30` → cambiarlo a 4:12 y guardar → el leaderboard muestra 4:12, ya
   no 5:30.
3. Borrar → confirma con el diálogo nativo ("¿Eliminar el resultado de
   Mara Miembro?") → el leaderboard vuelve a "Pizarra vacía". Confirmado
   en DB que no quedó ningún `WodResult` huérfano.
4. `pnpm typecheck` y `eslint` limpios (solo warnings preexistentes no
   relacionados).
5. Suite E2E completa (`wods.spec.ts`) sigue 5/5 verde después del
   cambio — sin regresión en el flujo de registrar/listar que ya
   cubría.

Datos de prueba limpiados después (el resultado de Mara se borró como
parte del propio test).

## Hallazgo H-WODS-02 — el modo TV nunca refrescaba datos solo — **CORREGIDO 2026-10-07**

El charter pide confirmar que el modo TV "se actualiza". `app/dashboard/wods/tv/page.tsx`
pide `/benchmarks/board` y `/rms/gym-board` **una sola vez**, al montar
(`useEffect(() => { if (user) fetchAll() }, [user, fetchAll])`) — el
único `setInterval` que existía era para rotar slides, no para volver a
pedir datos. Una pantalla de TV queda prendida sin interacción por
horas en el gym: sin esto, nunca se entera de un resultado nuevo hasta
que alguien la recarga a mano.

**Repro en vivo antes del fix**: con la pestaña de TV ya abierta,
registré un resultado nuevo de benchmark por API → esperé 65s con la
pestaña abierta, sin recargar → el resultado nunca apareció en pantalla
→ recién apareció tras un F5 manual.

**Fix**: `fetchAll` ahora corre también en un `setInterval` de 60s
(además de la carga inicial), igual que el patrón de "última
sincronización" de otras pantallas del dashboard. No toca `loading`
durante los refrescos silenciosos (ya estaba así, evita parpadeo).

**Verificado en vivo** (no con la primera prueba — esa resultó ser poco
confiable, ver nota abajo — sino monitoreando la red directamente):
con la pestaña de TV abierta, se registraron exactamente 2 llamadas a
`/benchmarks/board` y 2 a `/rms/gym-board` en una ventana de 65s — una
al cargar (t=0) y otra exactamente 60s después (t=60s), confirmando el
intervalo funcionando.

**Nota de método**: mi primer intento de verificación (esperar a que el
texto de un benchmark nuevo apareciera en pantalla) dio falso negativo
— la pantalla muestra un solo slide a la vez y lo rota cada 8s, así que
aunque los datos ya se habían refrescado, el slide con el dato nuevo
podía no estar siendo el que tocaba mostrar en ese momento. Cambié el
método a contar las llamadas de red reales en vez de inferir por el
contenido visible — lección para no repetir ese error de nuevo con
pantallas que rotan contenido.

## Hallazgo H-WODS-03 — una fila sin fecha en el Excel desaparecía sin aviso, no se marcaba como error — **CORREGIDO 2026-10-07**

El charter pide probar "un archivo con filas rotas". `app/dashboard/wods/import/page.tsx`
ya tenía manejo de errores por fila bastante bueno (tipo de clase no
encontrado, sin movimientos, archivo ilegible) — **excepto el caso más
obvio, la fecha vacía**. El parser saltaba la fila entera apenas
`row[0]` (la columna de fecha) venía vacía:

```js
if (!row || !row[0]) continue
```

Esa condición estaba pensada para saltar filas completamente vacías
(ej. una fila espaciadora al final del Excel), pero como solo miraba
la columna de fecha, una fila con datos reales pero sin fecha
**desaparecía del todo de la vista previa** — ni contaba en el total de
bloques, ni mostraba ningún error. El coach nunca se enteraba de que
esa fila existió ni de que no se importó.

**Repro en vivo antes del fix**: archivo con 4 filas (1 válida, 1 sin
fecha, 1 con tipo inexistente, 1 sin movimientos) → la vista previa
mostraba *"3 bloques → 1 WODs"* — la fila sin fecha nunca apareció en
la tabla, ni como error.

**Fix**: la condición de salto ahora chequea que **todas** las celdas
de la fila estén vacías (`row.every(c => !str(c))`), no solo la
columna de fecha. Una fila con cualquier dato pero sin fecha ahora cae
en la validación existente (`!date ? 'Sin fecha' : ...`) y se muestra
con su badge de error, igual que los otros casos rotos.

**Verificado en vivo**: mismo archivo de 4 filas → ahora la vista
previa muestra *"4 bloques → 1 WODs"*, con la fila sin fecha visible y
marcada "Sin fecha" en rojo; el botón sigue ofreciendo importar
únicamente la fila válida (sin bloquear el resto del archivo).
`pnpm typecheck` limpio. Suite E2E completa (`wods.spec.ts`) 5/5 verde
después del cambio.

## Confirmado sin cambios (no son hallazgos)

- **WOD duplicado mismo tipo/día**: ya protegido en backend
  (`POST /wods` → `400 "Ya existe una planificación para este tipo de
  clase en esa fecha"`), y el frontend (`ClassDetail.tsx`) lo muestra
  tal cual vía `alert()`. Probado directo contra la API.
- **Rango de fechas invertido** (`from > to`): el backend devuelve `[]`
  sin romperse; el selector de fechas del listado además ya usa
  `min`/`max` en los `<input type="date">` para no dejar invertirlo
  desde la UI en primer lugar.
- **Porcentajes de RM**: ya tiene cobertura de test unitario extensa y
  sólida en `calculateLoad.test.ts` (redondeos a 2.5/1/0.5/5 kg, casos
  de borde) — no encontré nada que agregar.
- **Limpieza de deuda menor**: borré un comentario `// BUG: ...` obsoleto
  en `e2e/modules/wods.spec.ts` que describía un bug de tipos
  (`score` como string) que ya no existe en el código actual — el test
  pasa hace rato usando el formulario real, el comentario solo quedaba
  confundiendo a quien lo leyera.
