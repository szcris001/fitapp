# Ficha: Pagos y transferencias

- **Módulo:** `pagos`
- **Rol(es):** ADMIN de qa-box-norte
- **Páginas:** /dashboard/payments (y registrar pago desde /dashboard/users/[id])
- **Casos de la matriz:** PAY-01..04 (docs/TESTING_STRATEGY.md §4)

## Objetivo
Usar esta parte de FitApp como la usaría el dueño del gym y encontrar lo que está roto, lo confuso o lo inseguro. La suite E2E ya cubre el camino feliz de los casos listados: confírmalo rápido y dedica la mayor parte del tiempo a lo que la suite no cubre.

## Datos del seed que te sirven
Transferencias pendientes con comprobante de Tomás (confirmar) y Rita (rechazar); la de Fernanda es de Conciliación: no la toques. Planes $35.000 / $49.990

## Qué intentar romper
- Ver el comprobante: se abre la imagen (con token de medios); la URL copiada sin token debe dar 401
- Confirmar Tomás: su membresía queda ACTIVE por 30 días y el ingreso suma en el mes (verifícalo en la API y en el dashboard)
- Rechazar Rita con motivo vacío y con motivo largo; ¿el alumno ve el motivo?
- Doble clic en confirmar: no debe crear dos membresías ni cobrar dos veces
- Pago manual para un alumno EXP-… creado por ti: monto exacto, sin /100; historial y KPIs coherentes
- Historial: filtros, orden, montos y fechas en hora local

## Además, siempre
- Recargar (F5) y usar el botón atrás del navegador en cada pantalla.
- Revisar la consola y la red del navegador en cada pantalla.
- Horas en hora local de Chile y montos en CLP (`$35.000`).
