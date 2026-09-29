# Ficha: Flujos del alumno (app móvil) vía API

- **Módulo:** `alumno-api`
- **Rol(es):** MEMBER member@qa-norte.test (Mara) y member@qa-sur.test; sin navegador: usa curl contra http://localhost:3001/api con su token (el panel web no admite alumnos)
- **Páginas:** Endpoints que usa apps/mobile (lee apps/mobile/src/screens y apps/mobile/src/lib/api.ts para ver cuáles)
- **Casos de la matriz:** MOB-01..05 (docs/TESTING_STRATEGY.md §4)

## Objetivo
Usar esta parte de FitApp como la usaría el dueño del gym y encontrar lo que está roto, lo confuso o lo inseguro. La suite E2E ya cubre el camino feliz de los casos listados: confírmalo rápido y dedica la mayor parte del tiempo a lo que la suite no cubre.

## Datos del seed que te sirven
Mara: plan activo, reserva mañana 19:00, RMs Back Squat 105 kg; clases de mañana 07:00/19:00/21:00; WOD de hoy con Back Squat 5x5 al 75%

## Qué intentar romper
- Reservar la de mañana 21:00: la reserva queda en el día correcto (hora local) y el cupo baja
- Reservar dos clases a la misma hora, sobre la capacidad, fuera de la ventana de reserva, sin membresía activa
- Cancelar dentro del plazo límite (cancelCutoffMins): rechazado con mensaje claro
- Cargas del WOD de hoy (my-loads): 75% de 105 kg redondeado según weightRounding del gym
- Registrar resultado de benchmark y de WOD; ver leaderboard
- Subir comprobante de transferencia (multipart) y verificar que aparece en /payments/transfer/pending del admin
- Todo lo anterior con IDs de clases/WODs de Sur: nunca debe funcionar

## Además, siempre
- Recargar (F5) y usar el botón atrás del navegador en cada pantalla.
- Revisar la consola y la red del navegador en cada pantalla.
- Horas en hora local de Chile y montos en CLP (`$35.000`).
