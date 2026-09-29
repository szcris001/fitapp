# Ficha: Alumnos y personal

- **Módulo:** `alumnos`
- **Rol(es):** ADMIN de qa-box-norte (y COACH para comparar permisos)
- **Páginas:** /dashboard/users, /dashboard/users/new, /dashboard/users/[id], /dashboard/staff
- **Casos de la matriz:** USR-01..11 (docs/TESTING_STRATEGY.md §4)

## Objetivo
Usar esta parte de FitApp como la usaría el dueño del gym y encontrar lo que está roto, lo confuso o lo inseguro. La suite E2E ya cubre el camino feliz de los casos listados: confírmalo rápido y dedica la mayor parte del tiempo a lo que la suite no cubre.

## Datos del seed que te sirven
5 alumnos en Norte (Mara con plan, RMs y asistencia; Mateo en riesgo; Tomás, Rita y Fernanda con transferencia pendiente)

## Qué intentar romper
- Crear alumno con RUT inválido, RUT duplicado, email con mayúsculas, teléfono con letras, fecha de nacimiento futura
- Buscar y filtrar: tildes (Tomás / Tomas), mayúsculas, texto inexistente
- Detalle de alumno: membresía, RMs, progreso gimnástico, asistencia; editar y recargar
- Asignar un plan a alguien que ya tiene uno activo; renovar; ver que no queden dos activas y que duren 30 días
- Subir avatar grande, no-imagen (PDF, .txt renombrado a .png)
- Personal: crear coach, cambiar rol, intentar dejar al gym sin admin, desactivarse a sí mismo
- Como COACH: qué puede ver/editar en alumnos (no debería cambiar roles ni pagos)

## Además, siempre
- Recargar (F5) y usar el botón atrás del navegador en cada pantalla.
- Revisar la consola y la red del navegador en cada pantalla.
- Horas en hora local de Chile y montos en CLP (`$35.000`).
