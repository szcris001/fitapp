---
name: Multi-tenancy Integration Test Findings
description: Hallazgos del análisis de aislamiento multi-tenant en FitHub — 24 tests, 0 vulnerabilidades, patrones confirmados
type: project
---

Hallazgos confirmados por 24 tests de integración de multi-tenancy (2026-04-30, 24/24 passing, 0 bugs):

1. **El aislamiento multi-tenant es correcto en todos los endpoints probados**. Ningún endpoint permite leer ni escribir datos de otro gym. No se encontraron vulnerabilidades.

2. **La única línea de defensa es el JWT_SECRET**. El backend confía completamente en el `gymId` del JWT. Si alguien obtiene el JWT_SECRET, puede forjar tokens con cualquier gymId y el backend lo aceptará como válido. Esto es diseño normal para JWT, pero crítico de proteger en producción.

3. **gymId del body NUNCA sobreescribe gymId del token**. Los schemas Zod de createPlanSchema, createClassTypeSchema, etc. no incluyen `gymId`. Todos los servicios reciben `gymId` como argumento desde la ruta (que lo toma del JWT). Confirmado con pruebas de body injection.

4. **Patrón de protección en servicios**: todos los servicios usan `findFirst({ where: { id, gymId } })` para verificar propiedad antes de actualizar/borrar. Si no encuentra el recurso, lanza error que la ruta convierte en 400 o 404.

5. **removeStudentByAdmin (DELETE /bookings/:bookingId/admin)** filtra por `class.gymId` (relación anidada): `findFirst({ where: { id: bookingId, class: { gymId } } })`. Correcto.

6. **Cleanup del test con memberB**: al agregar un MEMBER B para el test de booking, el cleanup debe hacerse por email dinámico (`mt-member-b-${TS}@test.local`) porque el ID no está en una variable global. Alternativa: guardar el id en una variable.

7. **5 suites de tests en multitenancy.integration.test.ts**:
   - Suite 1: Listados (GET lists no exponen datos cross-tenant)
   - Suite 2: Acceso por ID directo (GET /:id con ID de otro gym → 404)
   - Suite 3: Escritura (DELETE/PUT con ID de otro gym → 400/404, datos intactos verificados)
   - Suite 4: Creación con gymId inyectado en body (plan creado en gym correcto)
   - Suite 5: Token como fuente de verdad (decode JWT, verificación espejo de Admin B)

**Why:** Confirmado con 24 tests contra DB real fitapp_dev. El código estaba bien escrito desde el inicio.
**How to apply:** Al agregar nuevos endpoints, verificar que usen `findFirst({ where: { id, gymId } })` antes de operar. Agregar test de multi-tenancy correspondiente en Suite 2 (lectura) y Suite 3 (escritura).
