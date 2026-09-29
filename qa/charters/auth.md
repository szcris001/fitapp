# Ficha: Login, sesión y permisos por rol

- **Módulo:** `auth`
- **Rol(es):** Sin sesión, luego ADMIN (admin@qa-norte.test), COACH (coach@qa-norte.test), MEMBER (member@qa-norte.test) y SUPER_ADMIN (superadmin@qa.test, sin slug)
- **Páginas:** /login, /forgot-password, /reset-password, /change-password, menú lateral de /dashboard
- **Casos de la matriz:** AUTH-01..09, NAV-01..04 (la suite E2E ya los cubre: confírmalos rápido y dedica el tiempo a lo que no cubren) (docs/TESTING_STRATEGY.md §4)

## Objetivo
Usar esta parte de FitApp como la usaría el dueño del gym y encontrar lo que está roto, lo confuso o lo inseguro. La suite E2E ya cubre el camino feliz de los casos listados: confírmalo rápido y dedica la mayor parte del tiempo a lo que la suite no cubre.

## Datos del seed que te sirven
Todos los usuarios de qa/fixtures.json; los tokens de acceso duran 15 min y se renuevan con el refresh token

## Qué intentar romper
- Login con mayúsculas o espacios en email y slug; slug inexistente; contraseña vacía
- Varios intentos fallidos seguidos: ¿hay bloqueo y un mensaje que se entienda?
- Olvidé mi contraseña con email inexistente: no debe revelar si existe
- Abrir el panel en dos pestañas y cerrar sesión en una
- Con sesión de COACH, escribir a mano cada URL de admin (incluidas subpáginas como /dashboard/settings/movements y /dashboard/staff)
- Editar localStorage (fitapp_user.role = 'ADMIN') siendo COACH: la UI puede cambiar, pero la API debe seguir negando (403)
- Dejar la sesión inactiva más de 15 min (o borrar fitapp_token) y seguir navegando: debe renovarse sin perder trabajo

## Además, siempre
- Recargar (F5) y usar el botón atrás del navegador en cada pantalla.
- Revisar la consola y la red del navegador en cada pantalla.
- Horas en hora local de Chile y montos en CLP (`$35.000`).
