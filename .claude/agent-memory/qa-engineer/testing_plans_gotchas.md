---
name: testing_plans_gotchas
description: Gotchas de tests de integración para plans/memberships CRUD — UUID v4 en body, deactivatePlan sin bloqueo, error como objeto en Zod
type: feedback
---

Gotchas documentados al escribir `plans.integration.test.ts` (2026-05-04):

**1. UUIDs todo-ceros fallan validación Zod z.string().uuid() en body**

`'00000000-0000-0000-0000-000000000001'` NO pasa `z.string().uuid()` porque Zod exige UUID v4 (tercer grupo debe empezar en `4`). Cuando se usa en el body de un POST/PATCH, Zod rechaza con fieldError `Invalid UUID` en lugar de que el servicio retorne el error de negocio esperado (`'Usuario no encontrado'`).

**Why:** UUID v4 requiere que el 13er carácter sea '4'. Los UUIDs con todos ceros son versión 0 (nula), inválidos para Zod.

**How to apply:** Para test de "entidad inexistente" con UUID en body, usar un UUID v4 real inventado que no exista en DB, como `'a1b2c3d4-e5f6-4789-abcd-ef0123456789'`. Los fake UUIDs como path params (`:id`) no pasan por Zod y funcionan bien.

**2. deactivatePlan NO bloquea por membresías activas**

`deactivatePlan` simplemente marca `isActive=false` sin verificar si hay membresías activas referenciando ese plan. Los planes con membresías activas se pueden desactivar sin error. Este es comportamiento intencional del código (soft delete).

**Why:** Diseño de soft delete — el plan desaparece de los listados pero las membresías existentes siguen referenciándolo correctamente.

**How to apply:** No testear un "error al desactivar plan con membresías" porque el código no lo hace. El test correcto es verificar que SÍ se puede desactivar y que las membresías existentes permanecen intactas.

**3. `res.json().error` puede ser objeto cuando Zod rechaza el body**

Cuando el schema Zod rechaza el request, la ruta devuelve `{ error: parsed.error.flatten() }` que es un objeto `{ formErrors: [], fieldErrors: {...} }`, NO un string. Si el test hace `expect(res.json().error).toMatch(/texto/i)`, falla con "expects to receive a string, but got object".

**How to apply:** Para tests de validación Zod, usar `expect(res.statusCode).toBe(400)` sin asertar el mensaje exacto del error. O serializar: `JSON.stringify(res.json().error)` antes de usar toMatch.

**4. `assignMembership`: gymId del admin valida TANTO usuario COMO plan**

El servicio busca `user.findFirst({ where: { id, gymId } })` y `plan.findFirst({ where: { id, gymId } })` usando el gymId del token del admin. Si el admin de Gym B intenta asignar un plan de Gym A a un usuario de Gym A, falla en el check del usuario (usuario no está en Gym B), no en el plan. Esto es tenancy correcto.

**5. `renewMembership`: busca la última membresía por `createdAt desc`, no por `endsAt`**

Usa el plan de la membresía más reciente por createdAt. No toma la membresía activa ni la de endsAt más lejano — toma la última creada. Para tests de renovación, la membresía de referencia debe ser la última creada, no necesariamente la activa.
