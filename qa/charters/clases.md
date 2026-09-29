# Ficha: Clases, calendario y tipos de clase

- **Módulo:** `clases`
- **Rol(es):** ADMIN y COACH de qa-box-norte
- **Páginas:** /dashboard/classes, /dashboard/classes/new, /dashboard/classes/[id], /dashboard/classes/import, /dashboard/settings/class-types (y /import)
- **Casos de la matriz:** CLS-01..06 (docs/TESTING_STRATEGY.md §4)

## Objetivo
Usar esta parte de FitApp como la usaría el dueño del gym y encontrar lo que está roto, lo confuso o lo inseguro. La suite E2E ya cubre el camino feliz de los casos listados: confírmalo rápido y dedica la mayor parte del tiempo a lo que la suite no cubre.

## Datos del seed que te sirven
CrossFit -7..+3 días a las 07:00, 19:00 y 21:00; Halterofilia días pares 18:00; reservas de Mara (asistió en días pasados, reservada mañana 19:00)

## Qué intentar romper
- Horas mostradas = hora local de Chile en calendario y detalle (compara con startsAt de la API)
- Crear clase que cruza la medianoche (23:00-00:30), capacidad 0 o negativa, fin antes del inicio
- Clase recurrente: se generan las correctas, sin duplicados; editar/borrar una ocurrencia
- Detalle de clase: editar el WOD (bloques, movimientos, pesos Rx/Scaled por género, tipo de puntaje) y recargar
- Asistencia: marcar, desmarcar, marcar a alguien sin reserva, como COACH
- Importar Excel de clases y de tipos de clase con filas inválidas, columnas faltantes, fechas en otro formato

## Además, siempre
- Recargar (F5) y usar el botón atrás del navegador en cada pantalla.
- Revisar la consola y la red del navegador en cada pantalla.
- Horas en hora local de Chile y montos en CLP (`$35.000`).
