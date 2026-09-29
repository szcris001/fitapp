# Ficha: Seguridad transversal y aislamiento entre gyms

- **Módulo:** `seguridad`
- **Rol(es):** ADMIN de qa-box-sur (admin@qa-sur.test) atacando datos de qa-box-norte, más ADMIN y COACH de Norte
- **Páginas:** Todo el panel + API directa con curl
- **Casos de la matriz:** SEC-01..05 (docs/TESTING_STRATEGY.md §4)

## Objetivo
Usar esta parte de FitApp como la usaría el dueño del gym y encontrar lo que está roto, lo confuso o lo inseguro. La suite E2E ya cubre el camino feliz de los casos listados: confírmalo rápido y dedica la mayor parte del tiempo a lo que la suite no cubre.

## Datos del seed que te sirven
IDs de Norte: obtenlos con el token del admin de Norte (GET /api/users, /api/plans, /api/classes, /api/wods, /api/payments/transfer/pending). Comprobantes en /uploads/receipts/qa-receipt-member3.png etc.

## Qué intentar romper
- Con el token de Sur: GET/PUT/DELETE a cada recurso de Norte por ID (users, plans, classes, wods, memberships, payments, fintoc movements): esperado 403/404, nunca datos
- Crear en Sur una clase con classTypeId de Norte, asignar plan de Norte a alumno de Sur, WOD con classTypeId de Norte
- Archivos: comprobante/avatar/logo de Norte sin token, con token de acceso normal en ?token=, con token de medios de Sur
- HTML/JS en nombres, notas y descripciones (<img src=x onerror=alert(1)>): no se ejecuta en ninguna vista, incluido modo TV y correos
- COACH llamando por API a endpoints de admin (pagos, planes, configuración)
- Path traversal en rutas de archivos (/uploads/receipts/..%2F..%2F.env)

## Además, siempre
- Recargar (F5) y usar el botón atrás del navegador en cada pantalla.
- Revisar la consola y la red del navegador en cada pantalla.
- Horas en hora local de Chile y montos en CLP (`$35.000`).
