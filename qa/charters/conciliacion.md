# Ficha: Conciliación bancaria (Fintoc)

- **Módulo:** `conciliacion`
- **Rol(es):** ADMIN de qa-box-norte
- **Páginas:** /dashboard/fintoc
- **Casos de la matriz:** FIN-01..03 (FIN-04 widget real es manual: no lo pruebes) (docs/TESTING_STRATEGY.md §4)

## Objetivo
Usar esta parte de FitApp como la usaría el dueño del gym y encontrar lo que está roto, lo confuso o lo inseguro. La suite E2E ya cubre el camino feliz de los casos listados: confírmalo rápido y dedica la mayor parte del tiempo a lo que la suite no cubre.

## Datos del seed que te sirven
Link Fintoc de prueba (token falso: 'Sincronizar' contra Fintoc real va a fallar — verifica que falle con un mensaje claro). Movimiento MATCHED por RUT 44.444.444-4 → membresía pendiente de Fernanda ($35.000); movimiento sin identificar $12.345 RUT 99.999.999-9

## Qué intentar romper
- Montos de movimientos: $35.000 y $12.345 exactos
- Confirmar el calzado de Fernanda: su membresía queda ACTIVE y la transferencia sale de pendientes en /dashboard/payments
- Rechazar el sin identificar; volver a intentar confirmarlo
- Filtros por estado y paginación
- Sincronizar con el link falso: error entendible, sin romper la página
- Desconectar/reconectar (sin completar el widget real)

## Además, siempre
- Recargar (F5) y usar el botón atrás del navegador en cada pantalla.
- Revisar la consola y la red del navegador en cada pantalla.
- Horas en hora local de Chile y montos en CLP (`$35.000`).
