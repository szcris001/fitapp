# QA — Flujos del alumno vía API (alumno-api)

> Charter: `qa/charters/alumno-api.md` (MOB-01..05). Probado directo
> contra `http://localhost:3001/api` con curl, sin navegador (tal como
> pide la ficha — el panel web no admite alumnos). Gym `qa-box-norte`,
> fecha 2026-10-07.

## Confirmado funcionando (sin cambios)

- [x] **Reservar clase de mañana 21:00 local**: queda en el día correcto
      (confirmado con `/classes?from=...&to=...`), el cupo sube de 0 a 1.
      Clase UTC `2026-10-09T00:00:00Z` = 21:00 local Oct 8 — sin desvíos
      de huso horario.
- [x] **Fuera de la ventana de reserva** (`bookingWindowDays=3`): clase a
      10 días → `400 "Solo puedes reservar con hasta 3 día(s) de
      anticipación"`.
- [x] **Dentro del cutoff de reserva** (`bookingCutoffMins=60`): clase
      que empieza en 30 min → `400 "La clase comienza en 30 min. El
      mínimo para reservar es 60 minutos antes"`.
- [x] **Cancelar dentro del cutoff** (`cancelCutoffMins=30`): clase en 30
      min → `400 "No puedes cancelar con menos de 30 minutos de
      anticipación"`.
- [x] **Sobre capacidad** (capacity=1, ya ocupada): el segundo alumno con
      membresía activa queda en `WAITLIST`, no rechazado ni duplicado.
- [x] **Sin membresía activa**: `400 "No tienes una membresía activa"` —
      confirmado con dos personas del seed (Tomás Transferencia, Rita
      Rechazo) que efectivamente no tienen membresía activa todavía.
- [x] **Reservar la misma clase dos veces** (doble click / reintento):
      `400 "Ya tienes reserva en esta clase"` — no duplica.
- [x] **Cargas del WOD de hoy** (`/wods/class/:classId/my-loads`): Back
      Squat 5x5 al 75%, RM de Mara = 105 kg, `weightRounding` del gym =
      2.5 → `calculatedKg: 80` (78.75 → redondeo a múltiplo de 2.5).
      Coincide exacto con lo que ya cubre `calculateLoad.test.ts`.
- [x] **Registrar resultado de WOD** (`POST /wods/:id/results/me`) y
      **de benchmark** (`POST /benchmarks/:id/result`): ambos 201,
      aparecen correctamente en `GET .../me` y en el leaderboard
      (`scoreFormatted` correcto, "5:30" para 330s).
- [x] **Subir comprobante de transferencia** (multipart, PNG) con
      `planId` de una renovación: crea una `Membership` nueva
      `INACTIVE`/`PENDING_REVIEW`, con `startsAt` encadenado desde el
      `endsAt` de la membresía activa actual (no se solapa) — y aparece
      correctamente en `GET /payments/transfer/pending` del admin.
- [x] **IDs de `qa-box-sur` contra el gym de Mara (`qa-box-norte`)**:
      reservar clase de Sur → `404 "Clase no encontrada"`; `my-loads` de
      clase de Sur → `[]` (vacío, sin filtrar datos); registrar
      resultado en WOD de Sur → `404 "WOD no encontrado"`. Ningún caso
      filtra datos del otro gym ni rompe.

## Hallazgo H-ALUMNO-01 — un alumno puede reservar dos clases distintas con el mismo horario exacto — **CORREGIDO 2026-10-07**

El charter pide probar "reservar dos clases a la misma hora". Encontré
que **no existe ninguna validación de solapamiento de horario** en
`bookClass` (`apps/api/src/modules/classes/classes.service.ts`) — la
única regla relacionada es "mismo tipo de clase, mismo día" (la que ya
existe y se confirmó funcionando). Si dos clases son de **tipos
distintos** pero ocurren a la **misma hora exacta** (o con horarios que
se superponen), un alumno puede reservar ambas sin ningún aviso.

**Repro en vivo**: creé una clase de Halterofilia con el mismo
`startsAt`/`endsAt` que una clase de CrossFit que Mara ya tenía
reservada (ambas 19:00-20:00 local) → `POST /bookings` para la
Halterofilia devolvió `201 CONFIRMED` sin problema. Mara quedó con dos
reservas confirmadas, físicamente imposibles de cumplir a la vez.

Datos de prueba limpiados (reserva y clase de prueba borradas) antes de
implementar el fix.

**Decisión de Cristian** (consultado, no asumido): bloquear, con el
mismo criterio que "mismo tipo, mismo día" — aplica tanto a `bookClass`
(el alumno se reserva solo) como a `assignUserToClass` (el coach lo
asigna), sin excepción para el coach.

**Fix**: nuevo chequeo en ambas funciones
(`apps/api/src/modules/classes/classes.service.ts`), justo después del
de "mismo tipo/día": cuenta las reservas activas del alumno cuyo rango
horario se superpone con el de la clase que se intenta reservar
(`class.startsAt < cls.endsAt AND class.endsAt > cls.startsAt`, en
intervalo semiabierto — una clase que empieza justo cuando termina la
anterior **no** se considera solapada, se puede reservar back-to-back).
Mismo patrón que ya usa `removeStudentByAdmin`+`assignUserToClass` para
"mover": al mover a un alumno de clase, la reserva vieja ya se borró
antes de este chequeo, así que no choca contra sí misma.

**Verificado**: 3 tests nuevos en `bookings.integration.test.ts`
(`bookClass: solapamiento de horario` + 1 en
`assignUserToClass: coach incorpora alumnos`) — mismo horario exacto →
bloqueado; solapamiento parcial (empieza 30 min después, dentro del
rango) → bloqueado; back-to-back (empieza justo cuando termina la
anterior) → permitido. Confirmado con revert manual
(`git stash` de `classes.service.ts`) que los 3 tests nuevos fallan sin
el fix (40 passed, 3 failed) y vuelven a pasar al restaurarlo. Suite
completa de `classes` (43/43) y de toda la API corriendo en paralelo
para descartar efectos en otros módulos.
