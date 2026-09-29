# Ficha: Inicio (dashboard)

- **Módulo:** `dashboard`
- **Rol(es):** ADMIN y COACH de qa-box-norte
- **Páginas:** /dashboard
- **Casos de la matriz:** DASH-01..05 (docs/TESTING_STRATEGY.md §4)

## Objetivo
Usar esta parte de FitApp como la usaría el dueño del gym y encontrar lo que está roto, lo confuso o lo inseguro. La suite E2E ya cubre el camino feliz de los casos listados: confírmalo rápido y dedica la mayor parte del tiempo a lo que la suite no cubre.

## Datos del seed que te sirven
Ingresos del mes (pagos sembrados $35.000 x2), alumno en riesgo Mateo Riesgo, WOD 'QA WOD Hoy', clases de hoy 07:00, 18:00 (Halterofilia si el día es par), 19:00 y 21:00 hora local

## Qué intentar romper
- Cada número del dashboard contra la API (/gyms/me/stats, /analytics/gym-stats, /gyms/me/occupancy)
- Clases y WOD de hoy según hora local: prueba especialmente si ejecutas entre las 21:00 y las 24:00 de Chile
- Accesos rápidos: cada uno lleva a la página correcta
- Cambiar período de ocupación (7d/30d…) y recargar
- Modo oscuro/claro y menú colapsado: se ven bien y persisten

## Además, siempre
- Recargar (F5) y usar el botón atrás del navegador en cada pantalla.
- Revisar la consola y la red del navegador en cada pantalla.
- Horas en hora local de Chile y montos en CLP (`$35.000`).
