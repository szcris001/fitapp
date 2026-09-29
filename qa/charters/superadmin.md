# Ficha: Superadmin, sedes y suscripciones

- **Módulo:** `superadmin`
- **Rol(es):** SUPER_ADMIN (superadmin@qa.test, login SIN slug)
- **Páginas:** /superadmin, /superadmin/[id], /superadmin/new, /superadmin/subscriptions, /superadmin/config, /superadmin/profile, /dashboard/sedes
- **Casos de la matriz:** SUP-01..04 (docs/TESTING_STRATEGY.md §4)

## Objetivo
Usar esta parte de FitApp como la usaría el dueño del gym y encontrar lo que está roto, lo confuso o lo inseguro. La suite E2E ya cubre el camino feliz de los casos listados: confírmalo rápido y dedica la mayor parte del tiempo a lo que la suite no cubre.

## Datos del seed que te sirven
Gyms qa-box-norte y qa-box-sur (además de los gyms de desarrollo que existan: no los modifiques). Si creas un gym, usa slug qa-exp-<hora> (el seed los limpia)

## Qué intentar romper
- Listado de gyms y buscador
- Cambiar de sede a Norte: el panel muestra solo datos de Norte; volver y cambiar a Sur
- Crear gym con slug duplicado, con mayúsculas o espacios
- Suspender/reactivar SOLO un gym qa-exp-* creado por ti y verificar que su admin no puede entrar mientras está suspendido
- Suscripciones y configuración de plataforma: guardar y recargar
- Sin cambiar de sede, intentar abrir /dashboard/users: no debe mostrar datos de ningún gym

## Además, siempre
- Recargar (F5) y usar el botón atrás del navegador en cada pantalla.
- Revisar la consola y la red del navegador en cada pantalla.
- Horas en hora local de Chile y montos en CLP (`$35.000`).
