---
name: Patrón de validación gymId en endpoints con :userId como param de ruta
description: Cómo corregir endpoints que reciben userId en la URL sin validar que ese userId pertenezca al gym del requester
type: feedback
---

Cuando un endpoint recibe `:userId` como param de ruta (no del JWT) y lo usa directamente en una query, hay que validar que ese userId pertenezca al `gymId` del token antes de devolver datos.

**Patrón correcto en el service**:
```ts
export async function getFooByUser(userId: string, gymId: string) {
  const targetUser = await prisma.user.findFirst({ where: { id: userId, gymId } })
  if (!targetUser) return null   // el caller responderá 404

  return prisma.fooRecord.findMany({ where: { userId } })
}
```

**Patrón correcto en la route**:
```ts
app.get('/foo/user/:userId', { preHandler: requireCoachOrAdmin }, async (request, reply) => {
  const user = request.user as any
  const { userId } = request.params as any
  const result = await getFooByUser(userId, user.gymId)
  if (result === null) return reply.status(404).send({ error: 'Usuario no encontrado' })
  return reply.send(result)
})
```

**Por qué 404 y no 403**: devolver 403 revela que el usuario existe. El 404 no lo confirma ni lo desmiente — security through obscurity mínima recomendada.

**Por qué**: bug encontrado en `GET /rms/user/:userId` y `GET /gymnastic-progress/user/:userId`. Un ADMIN de Gym B podía ver datos de Gym A pasando un userId conocido. Corregido 2026-05-04.

**How to apply**: Siempre que un service reciba un `userId` externo (no del JWT), añadir la validación `{ id: userId, gymId }` antes de la query principal. Los endpoints `/me` están exentos porque el `userId` viene del JWT y es confiable.
