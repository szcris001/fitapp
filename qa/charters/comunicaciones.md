# Ficha: Comunicaciones y plantillas de correo

- **Módulo:** `comunicaciones`
- **Rol(es):** ADMIN de qa-box-norte
- **Páginas:** /dashboard/communications, /dashboard/settings/email-templates
- **Casos de la matriz:** COM-01..02 (docs/TESTING_STRATEGY.md §4)

## Objetivo
Usar esta parte de FitApp como la usaría el dueño del gym y encontrar lo que está roto, lo confuso o lo inseguro. La suite E2E ya cubre el camino feliz de los casos listados: confírmalo rápido y dedica la mayor parte del tiempo a lo que la suite no cubre.

## Datos del seed que te sirven
No hay SMTP real configurado: el envío puede fallar; verifica que el error sea claro. Planes QA Mensual (Mara, Mateo) y QA Ilimitado

## Qué intentar romper
- Destinatarios por segmento (todos, activos, por vencer, inactivos, individual, por plan): el conteo coincide con los datos
- Enviar con asunto o cuerpo vacío, con HTML/JS en el cuerpo
- Push vs email
- Plantillas: editar, previsualizar, enviar prueba, variables ({{nombre}} etc.) que se reemplazan
- Doble clic en enviar

## Además, siempre
- Recargar (F5) y usar el botón atrás del navegador en cada pantalla.
- Revisar la consola y la red del navegador en cada pantalla.
- Horas en hora local de Chile y montos en CLP (`$35.000`).
