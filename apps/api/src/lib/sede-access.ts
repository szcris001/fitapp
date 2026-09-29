/**
 * Quién puede operar una sede con /gyms/switch-sede (y conservarla en /auth/refresh):
 * - SUPER_ADMIN: cualquier gym, para dar soporte. Conserva su rol, así sigue viendo /superadmin.
 * - ADMIN: solo las sedes de las que es dueño (Gym.ownerEmail).
 * Las sedes suspendidas se validan aparte, para responder con su propio mensaje.
 */
export function canEnterSede(requester: { email: string; role: string }, gym: { ownerEmail: string | null }): boolean {
  if (requester.role === 'SUPER_ADMIN') return true
  return requester.role === 'ADMIN' && gym.ownerEmail === requester.email
}

/** Rol del token emitido al entrar a una sede */
export function sedeRole(requesterRole: string): 'SUPER_ADMIN' | 'ADMIN' {
  return requesterRole === 'SUPER_ADMIN' ? 'SUPER_ADMIN' : 'ADMIN'
}
