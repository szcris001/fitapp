---
name: ai_retention_findings
description: Módulo IA retención: gotcha vi.hoisted() para SDK Anthropic top-level, patrones de mock, casos borde de parsing JSON con backticks
type: project
---

Tests IA retención (src/modules/analytics/__tests__/ai.integration.test.ts): 22/22 passing.

**Gotcha clave — Anthropic se instancia en top-level del módulo:**
`ai.service.ts` hace `const anthropic = new Anthropic({ apiKey: ... })` fuera de cualquier función,
exactamente igual que expo-server-sdk en `push.ts`. Requiere vi.hoisted() obligatoriamente:

```ts
const { mockMessagesCreate } = vi.hoisted(() => ({
  mockMessagesCreate: vi.fn(),
}))

vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: class MockAnthropic {
      messages = { create: mockMessagesCreate }
    },
  }
})

import { aiRoutes } from '../ai.routes'
```

El import de ai.routes debe ir DESPUÉS de vi.mock(). Vitest hoistea vi.mock() antes de las importaciones.

**Patrón de setup por suite:**
- Suite retention-alerts: NO necesita mock de Anthropic. Solo DB real.
- Suite insights: mockMessagesCreate.mockResolvedValue(defaultInsightsResponse()) en beforeEach global.
- Suite athlete-projection: tiene su propio beforeEach que sobreescribe el mock global con defaultProjectionResponse().
  Esto porque el beforeEach global setea la respuesta de insights (formato diferente) y la proyección necesita otro formato.

**Estructura de respuesta por defecto:**
- insights: `{ content: [{ type: 'text', text: JSON.stringify({ insights: [...], summary: '...' }) }] }`
- projection: `{ content: [{ type: 'text', text: JSON.stringify({ projections: [...], nextMilestones: [...], coachTip: '...' }) }] }`

**Comportamiento del servicio con JSON inválido:**
- `getAiInsights`: si JSON.parse falla → `{ raw: content.text }`. Si type !== 'text' → throws 'Respuesta inesperada de IA' → ruta devuelve 500.
- `getAthleteProjection`: si JSON.parse falla → `{ athlete: user.name, raw: content.text }`. Misma lógica para type !== 'text'.
- Los backticks (```json...```) se limpian con `.replace(/```json|```/g, '').trim()` antes de JSON.parse.

**Caso de multi-tenancy en retention-alerts:**
- El endpoint usa `user.gymId` del JWT — nunca acepta gymId de query params.
- Test: adminA ve atRisk de gymA, no de gymB. adminB ve atRisk de gymB, no de gymA.
- memberB en gymB aparece en atRisk de gymB (tiene membresía ACTIVE sin bookings) — útil para verificar que el aislamiento funciona en ambas direcciones.

**daysLeft en expiringSoon:**
- La fórmula es `Math.ceil((endsAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24))`.
- Si `endsAt = now + 3 días`, el resultado es 3 o 4 dependiendo de la hora exacta del test.
- El test usa `toBeGreaterThanOrEqual(2)` y `toBeLessThanOrEqual(4)` para tolerar la imprecisión de tiempo.

**Setup de fixtures para retention-alerts:**
Para crear el escenario sin bookings (atRisk), simplemente NO crear bookings — el miembro cumple automáticamente la condición `bookings: { none: { createdAt: { gte: sevenDaysAgo } } }`.
Para inactive: NO crear membresía ACTIVE — Prisma setea `updatedAt` automáticamente al crear el usuario, que será `>= 14 días atrás` (gte fourteenDaysAgo) inmediatamente tras la creación.

**getOrCreatePlan helper:**
Para evitar duplicar planes en beforeAll, usar un cache en memoria (Record<gymId, planId>) dentro del módulo de test. Cada gym solo crea un plan mínimo compartido por todos los miembros que necesitan membresía.

**Orden de cleanup en afterAll:**
1. `prisma.booking.deleteMany` (si hay clases/bookings)
2. `prisma.rmRecord.deleteMany`
3. `prisma.gymnasticProgress.deleteMany`
4. `prisma.membership.deleteMany`
5. `prisma.user.deleteMany`
6. `prisma.plan.deleteMany` (por gymId)
7. `prisma.gym.deleteMany`
Los planes deben borrarse ANTES que los gyms (FK gymId en Plan).

**Why:** sin vi.hoisted(), el factory de vi.mock() lanza ReferenceError al intentar leer mockMessagesCreate antes de que esté inicializado (temporal dead zone).
**How to apply:** cualquier módulo que instancie un cliente de terceros en el top-level requiere vi.hoisted(). En FitHub: ai.service.ts (Anthropic) y push.ts (Expo) — mismo patrón. Confirmar antes de escribir el mock si el cliente se instancia top-level o dentro de funciones.
