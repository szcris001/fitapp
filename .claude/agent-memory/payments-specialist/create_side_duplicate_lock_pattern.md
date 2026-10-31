---
name: create-side-duplicate-lock-pattern
description: Patrón de advisory lock para evitar crear dos registros PENDING duplicados cuando no hay un registro previo que "reclamar" con updateMany (ej. submitTransferReceipt)
metadata:
  type: feedback
---

**Regla**: `updateMany` con claim atómico ([[transfer_atomicity_pattern]]) resuelve la carrera cuando ya existe una fila y dos requests compiten por transicionar su estado (confirmar/rechazar algo que ya existe). Pero cuando la carrera es sobre **crear** la primera fila (dos requests concurrentes intentando crear el mismo "pendiente" por primera vez), no hay ninguna fila que reclamar — `updateMany` no aplica. Ahí el patrón correcto es el mismo advisory lock que ya usa `bookClass`/`confirmPendingBooking` en `classes.service.ts`:

```ts
return prisma.$transaction(async (tx) => {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`
  const existing = await tx.X.findFirst({ where: { ...mismaClaveLogica, status: 'PENDING' } })
  if (existing) throw new Error('Ya existe uno pendiente...')
  return tx.X.create({ data: { ... } })
})
```

La clave del lock (`key`) debe ser la combinación lógica que define "duplicado" para ese flujo (en transferencias: `userId + ':' + planId`). El lock serializa las dos transacciones: la segunda espera a que la primera termine (commit o rollback) antes de hacer su propio `findFirst`, así que siempre ve la fila que acaba de crear la primera.

**Por qué**: encontrado en `submitTransferReceipt` (`payments.service.ts`, QA H01, 2026-10-30) — doble tap del botón o retry de red mandaban 2 `POST /payments/transfer/receipt` concurrentes para el mismo alumno+plan. No había ningún chequeo previo al `create`, así que las dos pasaban y quedaban 2 membresías `PENDING_REVIEW` duplicadas con las mismas fechas — si el admin confirmaba ambas, el alumno quedaba con dos períodos pagados/registrados encimados.

**Cómo aplicar**: antes de agregar cualquier flujo nuevo de "crear un pendiente que un admin va a revisar/confirmar después" (comprobantes, solicitudes, etc.), preguntarse: ¿qué pasa si el cliente manda la misma request dos veces en paralelo? Si la respuesta es "se crean dos filas", aplicar este patrón. Candidatos a revisar si aparece un bug similar en otra pasarela: cualquier `create` de `Membership`/`Payment` que dependa de un comprobante/token enviado por el cliente sin que haya un checkout server-side previo (`PaymentCheckout`) que ya controle la idempotencia (Stripe/MercadoPago/Flow/Khipu/PayU/Kushki/OpenPay/MACH sí tienen esa tabla intermedia con reclamo atómico vía `completeCheckout`, así que no les aplica este gap — es específico de transferencia manual, y potencialmente de cualquier flujo "manual" similar que se agregue a futuro, ej. `registerManualPayment` si alguna vez se expone al alumno en vez de solo al admin).

**Gotcha de testing**: al agregar este chequeo a un flujo que ya tenía tests, varios tests preexistentes empiezan a fallar si dejaban (a propósito o como efecto secundario de un 403/400 esperado) una fila PENDING sin resolver que el siguiente test pisaba sin problema porque antes no había ningún chequeo. Hay que agregar un helper de limpieza (`clearPendingXForY()`) y llamarlo antes de cada creación "nueva" en los tests afectados — no cambia la intención de esos tests, solo los aísla del nuevo chequeo.

Ver [[transfer_atomicity_pattern]] para el patrón equivalente del lado de actualización (confirmar/rechazar algo que ya existe).
