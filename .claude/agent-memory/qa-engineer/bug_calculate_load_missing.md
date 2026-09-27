---
name: calculateLoad implementada pero sin integrar en wod.service.ts
description: calculateLoad existe en wod.utils.ts y tiene 26 tests verdes — pero wod.service.ts line 49 sigue con recommendedKg null hardcodeado
type: project
---

**Estado al 2026-04-30:**

La función `calculateLoad(rmKg, percentage, rounding=2.5)` existe en:
`apps/api/src/modules/wod/wod.utils.ts`

Implementación real:
```typescript
export function calculateLoad(rmKg: number | null, percentage: number, rounding = 2.5): number | null {
  if (rmKg === null) return null
  const raw = rmKg * percentage / 100
  return Math.round(raw / rounding) * rounding
}
```

Importante: NO lanza error para porcentajes fuera de rango (a diferencia del plan en PLAN_DE_PRUEBAS.md). Acepta cualquier número.

26 tests unitarios en `apps/api/src/modules/wod/__tests__/calculateLoad.test.ts` — todos pasando.

PENDIENTE (assignee: backend-dev): integrar en `wod.service.ts` línea 49.
Cambio requerido — reemplazar:
```typescript
return { ...m, rmKg: rm, recommendedKg: null }
```
por:
```typescript
return { ...m, rmKg: rm, recommendedKg: rm !== null && m.percentage ? calculateLoad(rm, m.percentage) : null }
```

El campo `weightRounding` sigue sin existir en Prisma `Gym` model (pendiente migration).

**Why:** Feature §3.3.3 punto 4 — cálculo de carga personalizada — la función está lista y testeada, falta conectarla.

**How to apply:** Los tests ya existen. Cuando backend-dev integre, verificar que wod.service devuelve el valor correcto pasando el porcentaje del movimiento.
