# Ficha: Reportes y evolución

- **Módulo:** `reportes`
- **Rol(es):** ADMIN (reportes y evolución) y COACH (evolución) de qa-box-norte
- **Páginas:** /dashboard/reports, /dashboard/evolution
- **Casos de la matriz:** RPT-01, EVO-01 (docs/TESTING_STRATEGY.md §4)

## Objetivo
Usar esta parte de FitApp como la usaría el dueño del gym y encontrar lo que está roto, lo confuso o lo inseguro. La suite E2E ya cubre el camino feliz de los casos listados: confírmalo rápido y dedica la mayor parte del tiempo a lo que la suite no cubre.

## Datos del seed que te sirven
Pagos del mes, asistencias de Mara, RMs de Mara (Back Squat 100 → 105)

## Qué intentar romper
- Cada total del reporte contra la API y contra el dashboard (no deberían contradecirse)
- Filtros de período, meses sin datos, exportaciones (CSV/PDF) si existen: abrir el archivo y revisar montos/acentos
- Evolución: gráficos con 0, 1 y varios registros; alumno sin datos
- Como COACH: evolución carga completa y no expone montos de ingresos

## Además, siempre
- Recargar (F5) y usar el botón atrás del navegador en cada pantalla.
- Revisar la consola y la red del navegador en cada pantalla.
- Horas en hora local de Chile y montos en CLP (`$35.000`).
