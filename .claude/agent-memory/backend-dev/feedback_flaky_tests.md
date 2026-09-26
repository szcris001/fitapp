---
name: try/finally para cleanup de usuarios temporales en tests de integración + orderBy determinístico
description: Tests que crean usuarios extra deben usar try/finally para cleanup, y tests que dependen del orden de procesamiento de mocks deben usar orderBy explícito + orden de creación garantizado
type: feedback
---

En tests de integración con Vitest que crean usuarios temporales (extraUser, extraUser2) directamente dentro del `it()`:

**Regla 1 — try/finally para cleanup**: Siempre envolver el cuerpo del test en `try/finally`. El `finally` hace el cleanup del usuario y sus membresías. Sin esto, si un assert falla, el usuario queda huérfano en la DB, causando FK violations en `afterAll` en ejecuciones subsecuentes.

**Why:** Si el assert falla antes del cleanup manual (e.g., `await prisma.user.delete`), la DB queda sucia. En ejecución paralela esto causa FK violations en `afterAll.plan.deleteMany` porque las membresías del usuario extra existen y no están en `createdMembershipIds`.

**How to apply:**
```ts
const extraUser = await prisma.user.create({ ... })
try {
  const m = await createMembership({ userId: extraUser.id })
  // ... lógica del test ...
  // registrar IDs para cleanup ANTES de asserts
  createdMembershipIds.push(nuevoId)
  // asserts
  expect(...)
} finally {
  await prisma.membership.deleteMany({ where: { userId: extraUser.id } })
  await prisma.user.delete({ where: { id: extraUser.id } }).catch(() => {})
}
```

El `.catch(() => {})` en `user.delete` previene que el finally mismo falle si el user ya fue borrado.

---

**Regla 2 — orderBy determinístico en findMany + orden de creación controlado**: Cuando un test usa `mockResolvedValueOnce` encadenados y el servicio bajo test llama a Stripe en un loop sobre resultados de `findMany`, el orden de Postgres sin `orderBy` explícito es no determinístico. En ejecución paralela esto causa que los mocks se consuman en el orden incorrecto.

**Why:** `findMany` sin `orderBy` devuelve filas en el orden físico del heap de Postgres, que puede cambiar con escrituras concurrentes de otras suites. Si el test espera mock[0]=exitoso para membresía m1 pero el `findMany` devuelve [m2, m1], el mock[0] se consume para m2 y los asserts fallan.

**How to apply:**
1. Añadir `orderBy: { createdAt: 'asc' }` al `findMany` del job/servicio (tanto en el helper del test como en `cron.ts`).
2. En el test, controlar el orden de creación: crear primero la entidad que debe procesarse primero.
3. Añadir `await new Promise(r => setTimeout(r, 5))` entre creaciones consecutivas para garantizar timestamps distintos en Postgres (resolución milisegundos).
4. Que el orden de los `mockResolvedValueOnce`/`mockRejectedValueOnce` coincida con el orden de creación garantizado.

```ts
// Correcto: m2 (falla) se crea primero → menor createdAt → el job la procesa primero
const m2 = await createAutoRenewMembership({ userId: extraUser2.id })
await new Promise(r => setTimeout(r, 5)) // garantiza createdAt distintos
const m1 = await createAutoRenewMembership({ userId: memberId })

stripeMock
  .mockRejectedValueOnce(new Error('card_declined'))  // para m2 (primera en DB)
  .mockResolvedValueOnce({ id: 'pi_001', status: 'succeeded' })  // para m1

// El findMany con orderBy: { createdAt: 'asc' } garantiza [m2, m1]
```

**Caso real**: autorenew.integration.test.ts Caso 24 — RESUELTO 2026-05-05.
