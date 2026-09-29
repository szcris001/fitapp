# Ficha: Pizarra (WODs), importación, leaderboard y modo TV

- **Módulo:** `wods`
- **Rol(es):** COACH y ADMIN de qa-box-norte
- **Páginas:** /dashboard/wods, /dashboard/wods/new, /dashboard/wods/[id], /dashboard/wods/[id]/leaderboard, /dashboard/wods/import, /dashboard/wods/tv
- **Casos de la matriz:** WOD-01..05 (docs/TESTING_STRATEGY.md §4)

## Objetivo
Usar esta parte de FitApp como la usaría el dueño del gym y encontrar lo que está roto, lo confuso o lo inseguro. La suite E2E ya cubre el camino feliz de los casos listados: confírmalo rápido y dedica la mayor parte del tiempo a lo que la suite no cubre.

## Datos del seed que te sirven
WOD de CrossFit ayer, hoy (puntaje TIME) y mañana; Halterofilia sin WOD. Usa fechas lejanas (+200 días o más) para lo que crees

## Qué intentar romper
- Listado: filtros de fecha y tipo combinados, rango invertido, sin resultados
- Crear WOD duplicado para el mismo tipo y día: mensaje claro
- Importar la plantilla, luego el mismo archivo otra vez (debe avisar duplicados), luego un archivo con filas rotas
- Leaderboard: registrar resultados TIME (mm:ss), REPS y Rx/Scaled; orden correcto (menor tiempo primero); editar y borrar
- Modo TV: se ve bien a pantalla completa, sin controles de edición, se actualiza
- Pesos: kg con decimales, porcentajes de RM

## Además, siempre
- Recargar (F5) y usar el botón atrás del navegador en cada pantalla.
- Revisar la consola y la red del navegador en cada pantalla.
- Horas en hora local de Chile y montos en CLP (`$35.000`).
