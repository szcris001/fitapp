# Plan de Pruebas — Entorno de Producción (Railway)

> A diferencia de `docs/PLAN_DE_PRUEBAS.md` (genérico, con nombres que ya no
> existen en el código — `/v1/students`, rol `ATHLETE`, etc.), este documento
> describe la producción **real** que está corriendo hoy, con sus límites y
> riesgos concretos. Fecha: 2026-10-05.

## 0. Qué es "producción" hoy

Estado verificado (Railway API + `git log`, no supuesto):

- Proyecto Railway **`patient-serenity`**, 4 servicios: Postgres, Redis, API
  (Docker) y Web (Docker). Railway despliega automático en cada push a
  `master` vía su GitHub App — **no** a través de
  `.github/workflows/deploy.yml`, que sigue con los bloques comentados y sin
  `RAILWAY_TOKEN`: ese workflow hoy no hace nada, solo queda "esperando
  aprobación" indefinidamente.
- También existe un ambiente **`patient-serenity / staging`** en Railway
  (creado 2026-10-02). `docs/devops.md` todavía no lo menciona — vale la pena
  actualizarlo aparte de este plan.
- Volumen persistente montado en el servicio API para `/app/apps/api/uploads`
  (PR #42 corrigió permisos). RLS forzado en Postgres desde
  `20260927010000_rls_enforced` (`DATABASE_URL` usa el rol `fitapp_app`, sin
  bypass).
- **Sin dominio propio todavía** (Cloudflare/DNS sigue pendiente en
  `docs/devops.md`) — las URLs reales son las `*.up.railway.app` que asigna
  Railway por servicio. No están en el repo: hay que sacarlas del dashboard
  (Railway → proyecto → servicio → *Settings → Domains*).
- Sentry no está activado. Mobile sigue apuntando a una IP local (fuera de
  alcance de este plan).
- **Pendiente de confirmar antes de la sección 5**: si las claves de cada
  pasarela cargadas en el servicio API de Railway son `live` o de prueba.

## 1. Principio rector: staging ≠ producción

`apps/api/src/scripts/seed-qa.ts` (que crea los gyms QA Norte/QA Sur que usa
toda la suite Playwright) **se niega a correr si `NODE_ENV=production`**. Es
una barrera a propósito, no un olvido. Consecuencia para este plan:

- **Staging** es donde corre la batería pesada: `seed-qa` + la suite E2E
  completa (o un recorrido manual equivalente) contra la pila real
  desplegada — Docker, Postgres real, sin mocks — antes de aprobar un cambio
  para producción.
- **Producción** es un smoke test dirigido: sin fixtures masivas, con un gym
  QA creado a mano y borrado al final.

Si staging todavía no tiene el deploy del mismo commit que producción, correr
ahí la suite completa antes de validar nada en producción.

## 2. Prerrequisitos (una vez)

1. Sacar las URLs reales de API y Web desde el dashboard de Railway y
   guardarlas en `.env.production` local (el wizard las escribe como
   `RAILWAY_API_URL` / `RAILWAY_WEB_URL` cuando llega a ese paso — hoy el
   archivo solo tiene `JWT_SECRET`/`APP_DB_PASSWORD`/credenciales del
   superadmin, así que falta completarlas a mano si el wizard no se volvió a
   correr).
2. Confirmar en el dashboard si cada pasarela configurada usa clave `live` o
   de prueba (bloquea la sección 5).
3. Tener a mano las credenciales del `SUPER_ADMIN` real
   (`SUPERADMIN_EMAIL`/`SUPERADMIN_PASSWORD` en `.env.production`, o rotarlas
   con el script de creación de superadmin si hace falta).

## 3. Smoke test de infraestructura (riesgo bajo)

Contra `$API_URL` / `$WEB_URL` reales:

1. `GET $API_URL/health` → `200 {status: ok}`.
2. `GET $API_URL/healthz` → `200` con `db: ok` (valida conexión real a
   Postgres, no solo que el proceso esté vivo).
3. `$WEB_URL/login` carga sin 500.
4. CORS: una request desde un origen distinto a `FRONTEND_URL` debe ser
   rechazada (confirma que la lista blanca de `apps/api/src/index.ts` no
   quedó abierta en producción).
5. Rate limit: varios `POST /auth/login` seguidos con credenciales inválidas
   deben empezar a devolver `429` (confirma que `authRateLimit` está activo
   también en el ambiente real, no solo en los tests).
6. JWT: decodificar (sin verificar firma) un token de un login real y
   confirmar que trae `exp` y solo `{userId, gymId, role}` — nada más.
7. Archivos estáticos: `GET /uploads/<algo>` sin token → `401/403`; con un
   `mediaUrl` (`scope: media`) → `200`; `GET /uploads/assets/<algo>` sin
   token → `200` (única excepción pública).
8. Persistencia del volumen: subir un avatar o logo de prueba, forzar un
   redeploy (push vacío o "Restart" del servicio en Railway) y confirmar que
   el archivo sigue ahí — ya hubo un bug real de esto (PR #42), este paso es
   para no repetirlo en silencio.

## 4. Multi-tenancy / RLS (riesgo bajo si se usa un gym QA dedicado)

1. Desde el panel real de `SUPER_ADMIN`, crear un gym `QA Smoke <fecha>` con
   un admin de prueba (correo propio, nunca uno de un cliente real).
2. Como ese admin: crear un plan, un alumno, una clase, un WOD — confirmar
   que cada pantalla funciona contra la base real (acá sí hay datos reales
   de Postgres, a diferencia de los tests de CI que mockean Prisma).
3. Confirmar aislamiento: con el token de ese admin, intentar leer datos de
   otro gym (otro `gymId`) y confirmar `404`/vacío, nunca datos ajenos.
4. (Defensa en profundidad) Si hay acceso a la consola de Postgres con el rol
   `fitapp_app`, correr una query sin `SET app.current_gym_id` y confirmar
   que RLS la bloquea — procedimiento exacto en `docs/SECURITY.md` §7.
5. Al terminar: `DELETE /superadmin/gyms/:id/permanent` sobre el gym QA
   Smoke (cascade delete, PR #83) y confirmar que no quedó ningún residuo.
   Este sería el primer uso real en producción de esa feature — vale la pena
   hacerlo con calma la primera vez.

## 5. Pagos (riesgo alto — leer antes de tocar nada)

- Primero: confirmar modo `live`/test de cada pasarela (prerrequisito 2).
- **Si todas están en modo test/sandbox**: se puede correr el flujo de
  checkout completo con tarjetas de prueba de cada pasarela (mismas
  credenciales que `docs/SANDBOX_SETUP.md`) pero contra la URL pública real
  de producción — esto vale la pena porque valida los webhooks con una URL
  pública real, algo que en local no se puede probar bien.
- **Si alguna está en modo `live`**: no automatizar nada. Un solo pago manual
  de prueba, por el monto mínimo que acepte la pasarela, con reembolso
  inmediato desde el dashboard de esa pasarela. Documentar el resultado sin
  repetir el intento.
- Conciliación bancaria (Fintoc): si hay una cuenta real conectada, no hace
  falta generar movimientos nuevos — alcanza con confirmar que la pantalla de
  conciliación lista los movimientos reales sin error.
- Recordatorio de alcance: `payments-specialist` es el único agente
  autorizado a tocar código de `apps/api/src/modules/payments`. Este plan es
  de verificación, no habilita cambios ahí.

## 6. Monitoreo y rollback

- Sin Sentry activo, revisar `railway logs` (o el dashboard) después de cada
  tanda de pruebas y confirmar que no quedó ningún 500 nuevo.
- Rollback: Railway redespliega automático en cada push a `master`. Para
  volver atrás rápido: "Redeploy" de un deployment anterior desde el
  dashboard de Railway, o `git revert` + push si se prefiere que quede en el
  historial.

## 7. Qué falta para que "producción está probada" sea completo

- [ ] Dominio propio (Cloudflare) — hoy se prueba contra `*.up.railway.app`.
- [ ] Sentry — sin esto, un error fuera de este smoke test puede pasar
      desapercibido.
- [ ] Confirmar modo `live`/test de cada pasarela (bloquea la sección 5).
- [ ] Prueba de carga (ya pendiente en `docs/devops.md`) — este plan es
      funcional, no de carga.
- [ ] `docs/devops.md` no menciona el ambiente `staging` de Railway que ya
      existe desde 2026-10-02.
