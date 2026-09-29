# Ficha: Planes

- **Módulo:** `planes`
- **Rol(es):** ADMIN de qa-box-norte
- **Páginas:** /dashboard/plans
- **Casos de la matriz:** PLN-01..06 (docs/TESTING_STRATEGY.md §4)

## Objetivo
Usar esta parte de FitApp como la usaría el dueño del gym y encontrar lo que está roto, lo confuso o lo inseguro. La suite E2E ya cubre el camino feliz de los casos listados: confírmalo rápido y dedica la mayor parte del tiempo a lo que la suite no cubre.

## Datos del seed que te sirven
Planes 'QA Mensual' ($35.000) y 'QA Ilimitado' ($49.990) en CLP

## Qué intentar romper
- Precios: 0, negativo, con puntos de miles escritos a mano (35.000), con decimales en CLP, muy grande
- Moneda USD con centavos: se guarda y se muestra sin perder decimales
- Editar solo la descripción y confirmar que el precio no cambia (en la UI y en GET /api/plans)
- Plan trial, límite de clases, auto-renovación: cada opción se guarda y se refleja
- Desactivar un plan que tiene alumnos activos: qué pasa con ellos
- Duración: siempre 30 días (no debería poder cambiarse o, si se puede, respetarse)

## Además, siempre
- Recargar (F5) y usar el botón atrás del navegador en cada pantalla.
- Revisar la consola y la red del navegador en cada pantalla.
- Horas en hora local de Chile y montos en CLP (`$35.000`).
