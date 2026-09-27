// Criterios de retención compartidos por alertas IA y KPIs del dashboard
// (sin dependencias de IA: se puede usar desde cualquier módulo)

/** Alumno en riesgo de abandono: membresía activa y ninguna reserva en los últimos 7 días */
export function atRiskMembersWhere(gymId: string, now = new Date()) {
  return {
    gymId,
    role: 'MEMBER' as const,
    memberships: { some: { status: 'ACTIVE' as const } },
    bookings: { none: { createdAt: { gte: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) } } },
  }
}
