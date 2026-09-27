---
name: testing_activateMembership_gotchas
description: Gotchas y patrones para testear activateMembership de payments.service.ts — función privada, comportamiento exacto documentado con 20 tests
type: feedback
---

## activateMembership es privada — se testea vía handleStripeWebhook

`activateMembership` no está exportada en `payments.service.ts`. Se testea indirectamente
invocando `handleStripeWebhook` con un evento `checkout.session.completed` construido
manualmente (constructEvent mockeado para devolver el evento fabricado).

**Why:** No exportar la función solo por tests evita ensanchar la superficie pública del módulo.
**How to apply:** El patrón del test es: mockear `constructEvent` para devolver el evento deseado → llamar `handleStripeWebhook(Buffer.from('{}'), 'mock-sig')` → verificar estado en DB.

---

## Comportamiento exacto de activateMembership (verificado con tests)

```
activateMembership(userId, planId, paymentMethod, extraData?)
```

1. Busca membresía con `status IN ['ACTIVE','TRIAL'] AND endsAt > now` — ordena por `endsAt DESC`
2. Si la hay: `startsAt = existing.endsAt` (extensión, días no se pierden)
3. Si NO la hay: `startsAt = new Date()` (primera membresía o vencida)
4. `endsAt = startsAt + plan.durationDays`
5. `updateMany WHERE userId AND status IN ['ACTIVE','TRIAL']` → pone TODAS en INACTIVE
   - Incluye membresías ya vencidas (endsAt < now) que siguen en status ACTIVE
   - NO hay filtro por endsAt en el updateMany
6. Crea nueva membresía con `status='ACTIVE'`, paymentMethod, paidAt=now, extraData

**Casos borde confirmados:**
- Membresía ACTIVE pero ya vencida (endsAt < now): no se usa para extensión, pero SÍ queda INACTIVE por updateMany
- Membresía INACTIVE futura: no se usa para extensión, no cambia de status
- Múltiples ACTIVE: extiende desde la de endsAt más lejano (findFirst ordena por endsAt DESC)
- Plan no encontrado: early return en el caller (handleStripeWebhook), no lanza error al cliente

---

## Patrón de cleanup en tests con plan extra creado en el test

Si un test crea un plan adicional (ej: para probar autoRenewEnabled), borrar primero las
membresías que lo referencian antes de hacer `prisma.plan.delete()`:

```ts
await prisma.membership.deleteMany({ where: { planId: planExtra.id } })
await prisma.plan.delete({ where: { id: planExtra.id } })
```

**Why:** FK constraint `Membership.planId → Plan.id`. Sin borrar membresías primero, Prisma lanza P2003.

---

## activateMembership NO valida cross-gym

La función no verifica que `plan.gymId === user.gymId`. Esa validación la hace el caller
(cada webhook handler llama a `getUser(userId, gymId)` antes de invocar `activateMembership`).
El aislamiento cross-gym es responsabilidad del caller, no de la función.

**How to apply:** Al testear seguridad de pasarelas, verificar que el caller valida gymId,
no que `activateMembership` lo haga.

---

## Mock de constructEvent para múltiples tests

El mock de `constructEvent` necesita `mockReturnValueOnce` por cada llamada:

```ts
function getConstructEventMock() {
  return (Stripe as any).__mockConstructEvent
}

// En cada test:
getConstructEventMock().mockReturnValueOnce(fakeEvent)
await handleStripeWebhook(Buffer.from('{}'), 'mock-sig')
```

`vi.clearAllMocks()` en afterEach limpia los `.mockReturnValueOnce` acumulados.
