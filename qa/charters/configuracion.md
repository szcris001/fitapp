# Ficha: Configuración del gym

- **Módulo:** `configuracion`
- **Rol(es):** ADMIN de qa-box-norte
- **Páginas:** /dashboard/settings, /dashboard/settings/movements, /dashboard/theme-preview, /dashboard/onboarding si aparece
- **Casos de la matriz:** CFG-01..04 (docs/TESTING_STRATEGY.md §4)

## Objetivo
Usar esta parte de FitApp como la usaría el dueño del gym y encontrar lo que está roto, lo confuso o lo inseguro. La suite E2E ya cubre el camino feliz de los casos listados: confírmalo rápido y dedica la mayor parte del tiempo a lo que la suite no cubre.

## Datos del seed que te sirven
Restaura al final cualquier valor que cambies (anota los originales antes). No cambies slug, zona horaria ni nombre del gym

## Qué intentar romper
- Datos del centro: guardar, recargar y ver que persisten; email/teléfono inválidos
- Ventanas de reserva y cancelación: valores 0, negativos, enormes
- Logo: PNG, JPG, SVG, archivo enorme, no-imagen; se ve en el menú lateral
- Pasarelas de pago: guardar credenciales falsas; que no se muestren secretos completos después
- Cuenta bancaria para transferencias
- Biblioteca de movimientos: agregar duplicados, con tildes, borrar uno usado en un WOD
- Tema/colores de marca: se aplican y persisten

## Además, siempre
- Recargar (F5) y usar el botón atrás del navegador en cada pantalla.
- Revisar la consola y la red del navegador en cada pantalla.
- Horas en hora local de Chile y montos en CLP (`$35.000`).
