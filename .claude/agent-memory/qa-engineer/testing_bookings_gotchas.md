---
name: testing_bookings_gotchas
description: Gotchas de testing en bookClass/cancelBooking/waitlist — unique constraint, comportamientos no obvios del código
type: feedback
---

## Gotcha: unique(userId, classId) en Booking

Booking tiene constraint único en (userId, classId). En tests donde múltiples it() comparten la misma `classId` y el mismo `userId`, los tests posteriores fallan con P2002 al intentar crear un segundo booking para el mismo par.

**Solución**: crear una `classId` nueva por test cuando se necesite probar comportamientos distintos con el mismo userId en la misma suite. No asumir que el `afterEach` del siguiente describe limpiará la tabla a tiempo.

**Why:** el constraint es a nivel DB y los tests se encadenan dentro de la misma transacción de Vitest.

**How to apply:** Siempre que un test de bookings necesite crear un booking fresco para un userId que ya tiene booking en esa clase (aunque esté en otro status como CONFIRMED ya convertido), usar una clase diferente.

## Comportamientos no obvios de bookClass

1. **Booking CANCELLED previo**: `bookClass` no crea un nuevo registro — hace `update` del existente a CONFIRMED. El test debe hacer `findUnique` y esperar el mismo `id`. Documentar como "upsert implícito".

2. **TRIAL con maxClasses**: el conteo usa `Booking.count` con `status IN (CONFIRMED, ATTENDED)` — incluye ATTENDED. Si un alumno trial tiene 1 ATTENDED + 1 CONFIRMED ya consumió 2 clases aunque no haya asistido a ambas "activamente".

3. **cancelBooking solo llama promoteFromWaitlist si status era CONFIRMED o PENDING_CONFIRM** — si cancelas un WAITLIST, nobody gets promoted. Verificado y correcto por diseño.

## Gotcha: waitlistConfirmEnabled en el Gym del test

El comportamiento de `promoteFromWaitlist` depende del campo `gym.waitlistConfirmEnabled`. Al crear el gym de fixtures con `waitlistConfirmEnabled: false` (default), la promoción va directo a CONFIRMED. Para testear el flujo PENDING_CONFIRM hay que crear un gym separado con `waitlistConfirmEnabled: true`.

No reutilices el gym base del beforeAll para estos tests — crea un gym limpio en su propio beforeAll/afterAll.

## Patrón de setup recomendado para tests de reservas

- Gym A: `bookingWindowDays=7, bookingCutoffMins=60, cancelCutoffMins=30, waitlistConfirmEnabled=false`
- Clases "en el futuro" para tests de flujo feliz: `Date.now() + 2*60*60*1000` (2 horas — dentro del window y fuera del cutoff)
- Clases para pruebas de "clase llena": usa una hora separada (24h+) para no mezclar bookings entre suites
- Separar suites de waitlist por gimnasio si testeas waitlistConfirmEnabled=true vs false
