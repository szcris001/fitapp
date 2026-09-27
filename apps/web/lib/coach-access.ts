// Rutas del dashboard que puede abrir un COACH (lista de permitidos): Inicio exacto
// y las secciones marcadas coachAllowed en el menú, con sus subpáginas.
// Cualquier página que no esté aquí (pagos, evolución, sedes…) queda bloqueada por defecto.
export function isCoachAllowedPath(pathname: string, allowedHrefs: string[]): boolean {
  if (pathname === '/dashboard') return true
  return allowedHrefs.some(href =>
    href !== '/dashboard' && (pathname === href || pathname.startsWith(href + '/')),
  )
}
