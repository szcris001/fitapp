# Plan de Pruebas — Entorno de Producción (Railway)

> A diferencia de `docs/PLAN_DE_PRUEBAS.md` (genérico, con nombres que ya no
> existen en el código — `/v1/students`, rol `ATHLETE`, etc.), este documento
> describe la producción **real** que está corriendo hoy, con sus límites y
> riesgos concretos. Organizado **por objetivo**: cada uno dice qué se quiere
> probar, por qué, el riesgo si algo sale mal, quién lo ejecuta, y cómo se
> sabe que pasó. Fecha: 2026-10-05, actualizado 2026-10-08 (reestructurado
> por objetivos + objetivo nuevo de regresión de los fixes de esta ronda de
> QA — ver `docs/QA_PROGRESS.md`).

## Qué es "producción" hoy

Estado verificado (Railway API + `git log`, no supuesto):

- Proyecto Railway **`patient-serenity`**, 4 servicios: Postgres, Redis, API
  (Docker) y Web (Docker). Railway despliega automático en cada push a
  `master` vía su GitHub App — **no** a través de
  `.github/workflows/deploy.yml`, que sigue con los bloques comentados y sin
  `RAILWAY_TOKEN`: ese workflow hoy no hace nada, solo queda "esperando
  aprobación" indefinidamente.
- También existe un ambiente **`patient-serenity / staging`** en Railway
  (creado 2026-10-02). `docs/devops.md` todavía no lo menciona.
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
- **Pendiente de confirmar antes del Objetivo 4**: si las claves de cada
  pasarela cargadas en el servicio API de Railway son `live` o de prueba.

## Principio rector: staging ≠ producción

`apps/api/src/scripts/seed-qa.ts` (que crea los gyms QA Norte/QA Sur que usa
toda la suite Playwright) **se niega a correr si `NODE_ENV=production`**. Es
una barrera a propósito, no un olvido. Consecuencia para este plan:

- **Staging** es donde corre la batería pesada: `seed-qa` + la suite E2E
  completa (o un recorrido manual equivalente) contra la pila real
  desplegada — Docker, Postgres real, sin mocks — antes de aprobar un cambio
  para producción.
- **Producción** es un smoke test dirigido por objetivos: sin fixtures
  masivas, con un gym QA creado a mano y borrado al final.

Si staging todavía no tiene el deploy del mismo commit que producción, correr
ahí la suite completa antes de validar nada en producción.

## ¿Hace falta un agente especialista nuevo?

No — el roster ya cubre esto sin inventar un rol nuevo:

- **`security`**: su propia descripción dice *"Invocar obligatoriamente antes
  de cualquier release a producción"*. Es el **Objetivo 0** de este plan, no
  opcional.
- **`devops`**: dueño de ambientes, secretos y despliegue — es quien saca las
  URLs reales de Railway y confirma el estado de `staging` (prerrequisitos,
  Objetivo 1).
- **`payments-specialist`**: único autorizado a tocar
  `apps/api/src/modules/payments` — para el Objetivo 4 (pagos), si algo no
  cuadra, es a quien se deriva el hallazgo, no se improvisa un fix ahí.
- **`qa-engineer`**: dueño de `QUALITY.md` — si este smoke test encuentra
  algo, es quien decide si bloquea el release o queda como deuda registrada.

Yo ejecuto el smoke test en vivo (como vengo haciendo toda esta ronda de QA),
invocando a cada especialista para la parte que le corresponde. Un agente
"QA de producción" genérico no aportaría nada que estos cuatro no cubran ya.

## Prerrequisitos (una vez, antes de cualquier objetivo)

1. Sacar las URLs reales de API y Web desde el dashboard de Railway y
   guardarlas en `.env.production` local (el wizard las escribe como
   `RAILWAY_API_URL` / `RAILWAY_WEB_URL` cuando llega a ese paso — hoy el
   archivo solo tiene `JWT_SECRET`/`APP_DB_PASSWORD`/credenciales del
   superadmin, así que falta completarlas a mano si el wizard no se volvió a
   correr). Pedir a `devops` si no hay acceso directo al dashboard.
2. Confirmar en el dashboard si cada pasarela configurada usa clave `live` o
   de prueba (bloquea el Objetivo 4).
3. Tener a mano las credenciales del `SUPER_ADMIN` real
   (`SUPERADMIN_EMAIL`/`SUPERADMIN_PASSWORD` en `.env.production`, o rotarlas
   con el script de creación de superadmin si hace falta).
4. Confirmar que el commit desplegado en producción es el que se quiere
   probar (`railway status` o el dashboard) — y que, si staging existe, ya
   pasó la batería completa sobre ese mismo commit.

---

## Objetivo 0 — Ningún hueco de seguridad nuevo llega a producción

**Por qué**: es el único paso obligatorio por diseño del propio rol
`security`, no una preferencia de este plan.
**Riesgo si se salta**: alto — exactamente el tipo de cosa que un smoke
test funcional no detecta (headers, RLS, rate limiting, secretos).
**Quién**: agente `security`.
**Owner de la decisión**: `security` decide si bloquea el release; si
bloquea, no se avanza a los objetivos siguientes hasta resolverlo.
**Éxito**: checklist pre-deploy de `security` sin hallazgos críticos
abiertos.

---

## Objetivo 1 — La infraestructura está viva y segura por fuera (riesgo bajo)

**Por qué**: si esto falla, nada de lo demás importa — no hay nada que
probar si el servicio ni siquiera responde o las cabeceras de seguridad
básicas no están.
**Riesgo si falla**: bajo de causar daño (son solo lecturas), pero alto de
impacto si de verdad está roto (el sitio no sirve).
**Quién**: yo, contra `$API_URL`/`$WEB_URL` reales. `devops` si hace falta
forzar un redeploy o mirar logs de arranque.
**Éxito**: los 8 puntos de abajo, todos en verde.

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

---

## Objetivo 2 — Un gym nuevo queda completamente aislado de los demás (riesgo bajo si se usa un gym QA dedicado)

**Por qué**: multi-tenancy es la promesa central del producto — un bug acá
expone datos de un cliente real a otro.
**Riesgo si falla**: altísimo (fuga de datos entre clientes reales), aunque
el riesgo de ESTA prueba en sí es bajo porque se usa un gym creado y
borrado para la ocasión.
**Quién**: yo, con el `SUPER_ADMIN` real.
**Éxito**: los 5 pasos de abajo, en particular el punto 3 (aislamiento) sin
ninguna fuga.

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

---

## Objetivo 3 — Los fixes de esta ronda de QA se comportan igual en producción (riesgo bajo, nuevo)

**Por qué**: esta sesión encontró y corrigió 12+ bugs reales en local (PRs
#85-#89) — varios dependían de condiciones específicas (zona horaria del
navegador, formato de HTML en emails, carreras de fecha) que vale la pena
reconfirmar una vez desplegados, en vez de asumir que "si pasó en CI, pasa
en todos lados".
**Riesgo si falla**: bajo-medio — ya están cubiertos por tests automáticos,
esto es una confirmación final, no la primera línea de defensa.
**Quién**: yo, sobre el gym QA Smoke del Objetivo 2 (no crear uno nuevo).
**Éxito**: los 4 checks de abajo.

1. **H-DASH-01** (dashboard un día adelantado): abrir `/dashboard` con el
   navegador en una zona horaria distinta a la del gym QA Smoke (DevTools →
   Sensors → Location, o Playwright `timezoneId`) y confirmar que el WOD del
   día / fecha del header siguen siendo los del gym, no los del navegador.
2. **H-COM-02** (HTML sin escapar en emails): enviar un email de prueba
   desde Comunicaciones con `<b>` o `&` en el cuerpo, a un correo propio, y
   confirmar que llega como texto literal, no como HTML roto o ejecutado.
3. **H-ALUMNO-01** (solapamiento de horario): intentar reservar dos clases
   con el mismo horario exacto desde la cuenta del alumno de prueba del gym
   QA Smoke → debe rechazar con el mensaje claro.
4. **H-WODS-02** (modo TV sin auto-refresh): abrir `/dashboard/wods/tv`,
   registrar un resultado nuevo desde otra pestaña, esperar ~70s sin
   recargar → debe aparecer solo.

---

## Objetivo 4 — Pagos no rompen nada real (riesgo alto — leer antes de tocar nada)

**Por qué**: es la única parte de este plan que puede mover dinero real o
tocar cuentas bancarias reales si algo sale mal.
**Riesgo si falla**: alto — cobro duplicado, cobro al monto equivocado, o
exposición de un secreto de pasarela.
**Quién**: `payments-specialist` revisa el resultado; yo ejecuto los pasos
de verificación (no implemento nada ahí, ver recordatorio de alcance abajo).
**Éxito**: checkout completo si es sandbox; un único pago mínimo con
reembolso si es `live`; conciliación lista los movimientos reales sin error.

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
  conciliación lista los movimientos reales sin error. Fintoc Pay (H-PAGOS-04,
  corregido esta ronda): si hay credenciales reales de Fintoc, probar que el
  alumno de prueba puede iniciar el widget desde la app — si no hay
  credenciales reales (como en local), confirmar que falla con el mensaje
  claro de siempre, no en blanco.
- Recordatorio de alcance: `payments-specialist` es el único agente
  autorizado a tocar código de `apps/api/src/modules/payments`. Este plan es
  de verificación, no habilita cambios ahí.

---

## Objetivo 5 — Si algo sale mal, se nota y se puede revertir (monitoreo y rollback)

**Por qué**: sin esto, cualquier hallazgo de los objetivos de arriba queda
sin forma de confirmarse ni de corregirse rápido.
**Riesgo si falla**: medio — no causa el problema, pero lo deja sin
detectar o sin forma rápida de revertirlo.
**Quién**: yo reviso logs después de cada objetivo; `devops` para el
rollback si hace falta.
**Éxito**: cero 500 nuevos en los logs tras cada tanda; un plan de rollback
probado (no solo documentado).

- Sin Sentry activo, revisar `railway logs` (o el dashboard) después de cada
  tanda de pruebas y confirmar que no quedó ningún 500 nuevo.
- Rollback: Railway redespliega automático en cada push a `master`. Para
  volver atrás rápido: "Redeploy" de un deployment anterior desde el
  dashboard de Railway, o `git revert` + push si se prefiere que quede en el
  historial.

---

## Qué falta para que "producción está probada" sea completo

- [ ] Dominio propio (Cloudflare) — hoy se prueba contra `*.up.railway.app`.
- [ ] Sentry — sin esto, un error fuera de este smoke test puede pasar
      desapercibido.
- [ ] Confirmar modo `live`/test de cada pasarela (bloquea el Objetivo 4).
- [ ] Prueba de carga (ya pendiente en `docs/devops.md`) — este plan es
      funcional, no de carga.
- [ ] `docs/devops.md` no menciona el ambiente `staging` de Railway que ya
      existe desde 2026-10-02.
