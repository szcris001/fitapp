---
name: mockResolvedValueOnce se consume en orden de llegada a la función mockeada, no en orden de test
description: En ejecución paralela, mockResolvedValueOnce de un test puede ser consumido por membresías de otro test si la DB no fue limpiada
type: feedback
---

**Regla**: Cuando el job (runAutoRenewJob) hace `findMany` sobre la DB, recoge TODAS las membresías elegibles, incluyendo las de tests anteriores que no fueron limpiadas. Los `mockResolvedValueOnce` configurados para el test actual pueden ser consumidos por membresías "sucias" de tests previos.

**Why:** En ejecución paralela de Vitest, el `afterEach` de un test puede correr concurrentemente con el `beforeEach` del siguiente. Si una membresía no fue registrada en `createdMembershipIds` (porque el test falló antes del push), queda en la DB y contamina el siguiente test del mismo describe.

**How to apply:** Para tests que cobran membresías:
1. Registrar IDs de membresías NUEVAS (creadas por el cobro exitoso) a `createdMembershipIds` INMEDIATAMENTE después del job, ANTES de los asserts.
2. Usar `try/finally` para garantizar cleanup de usuarios temporales.
3. El orden correcto es: crear → mockear → correr job → registrar nuevas membresías para cleanup → asserts.

Esto garantiza que `afterEach` siempre limpia las membresías aunque el assert falle, evitando que contaminen el siguiente test.
