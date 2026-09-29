# Ficha: Alertas IA y proyecciones

- **Módulo:** `ia`
- **Rol(es):** ADMIN de qa-box-norte
- **Páginas:** /dashboard/alerts
- **Casos de la matriz:** IA-01..03 (docs/TESTING_STRATEGY.md §4)

## Objetivo
Usar esta parte de FitApp como la usaría el dueño del gym y encontrar lo que está roto, lo confuso o lo inseguro. La suite E2E ya cubre el camino feliz de los casos listados: confírmalo rápido y dedica la mayor parte del tiempo a lo que la suite no cubre.

## Datos del seed que te sirven
Mateo Riesgo en riesgo y por vencer en 2 días; Mara con RMs (Back Squat 100→105 kg, Deadlift 130, Thruster 60). Si no hay ANTHROPIC_API_KEY válida, las secciones con Claude deben fallar con un mensaje claro

## Qué intentar romper
- Alertas de retención: quién aparece y por qué; coincide con la API /ai/retention-alerts
- Proyección por alumno: elegir alumno sin RMs, con RMs; tiempos de espera largos (¿hay indicador de carga?)
- Insights: repetir la consulta; ver que no se dispare en bucle
- Errores de IA: mensaje entendible, la página sigue usable

## Además, siempre
- Recargar (F5) y usar el botón atrás del navegador en cada pantalla.
- Revisar la consola y la red del navegador en cada pantalla.
- Horas en hora local de Chile y montos en CLP (`$35.000`).
