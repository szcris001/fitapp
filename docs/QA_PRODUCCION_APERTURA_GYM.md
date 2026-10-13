# QA real en producción — Objetivo 1: nace un gym nuevo

> Contexto: `docs/PLAN_DE_PRUEBAS_PRODUCCION.md`, reorganizado por el ciclo de
> vida real de abrir un gym (no por página/módulo). Ambiente: producción en
> Railway (`https://web-production-1f7d5.up.railway.app`), no staging.
> Ejecutado por Cristian en el navegador (creación de datos reales en
> producción — Claude no escribe directo ahí por política de permisos),
> verificación y fixes por Claude. Fecha: 2026-10-12.

## Hallazgo H-SUPERADMIN-01 — el superadmin perdía la sesión cada 15 min en /superadmin — **CORREGIDO** (PR #90)

`lib/api.ts` saltaba el intento de refresh de token entero en cualquier ruta
`/superadmin`, para evitar un redirect en bucle hacia `/login` (esas rutas
muestran su propio formulario cuando no hay `user` en el store). Pero el salto
aplicaba también con sesión válida: cada 15 min (expiración del access token)
el superadmin se encontraba con "Token inválido o expirado" en vez de
refrescar solo, como pasa en el resto del panel.

**Repro en vivo**: login como superadmin → esperar más de 15 min (tiempo que
tomó completar el plan de prueba) → intentar crear el gym desde
`/superadmin/new` → "Token inválido o expirado", sin reintento automático.

**Fix**: `doLogout()` decide el redirect según la ruta actual (no redirige si
ya está en `/login` o `/superadmin`), y el interceptor de refresh ya no se
salta por ruta — solo por ausencia real de refresh token. Test de regresión
`SUP-07`: corrompe el access token en localStorage con un refresh token
válido y confirma que la página sigue funcionando sin desloguear.

## Hallazgo H-SUPERADMIN-02 — no se podía recrear un gym con el slug de uno recién eliminado — **CORREGIDO**

Repro: Cristian creó `qa-apertura-2026-10`, lo eliminó desde el panel para
volver a probar desde cero, y al recrearlo con el mismo slug la API devolvió
`"Un valor ya está registrado en el sistema"` (400 genérico).

Causa: `Gym.slug` es `@unique` a nivel de columna en el schema de Prisma, sin
relación con `deletedAt`. El código de `POST /superadmin/gyms` sí intenta
permitir la reutilización (`findFirst({ where: { slug, deletedAt: null } })`
no bloquea si el dueño del slug está en el historial), pero nunca liberaba el
slug del gym eliminado — así que `tx.gym.create` con el mismo slug siempre
chocaba contra el índice único de Postgres.

**Fix**: al crear un gym cuyo slug pertenece a uno soft-deleted, la misma
transacción le renombra el slug al gym viejo (`<slug>-eliminado-<timestamp>`)
antes de crear el nuevo con el slug limpio. No afecta `restore`: si nadie
reusó el slug, restaurar el gym eliminado sigue funcionando igual que antes.
Test de regresión en `superadmin.integration.test.ts` (`DELETE
/api/superadmin/gyms/:id (soft delete)`): soft-delete → crear un gym nuevo
con el mismo slug → 201, y el gym viejo queda con el slug renombrado.

## Hallazgo H-PROD-EMAIL-01 — ningún email sale desde producción — **CORREGIDO, verificado con envío real**

Al crear el gym, el correo de bienvenida falló con `Connection timeout`.
`/superadmin/config` → SMTP de plataforma está vacío, así que el código caía
al fallback de Ethereal (`smtp.ethereal.email:587`), que normalmente conecta
sin problema. Que **incluso ese fallback** diera timeout era la pista.

**Causa confirmada** (no una suposición): la [documentación oficial de
Railway](https://docs.railway.com/networking/outbound-networking) dice
textualmente que SMTP solo está disponible desde el plan Pro — los planes
Free/Trial/Hobby **tienen SMTP saliente deshabilitado a propósito**
(antispam), sin excepción de host de destino. El proyecto `patient-serenity`
está en plan Hobby. Por eso fallaba hasta el fallback a Ethereal: ambos son
SMTP.

**Decisión de producto** (confirmada con Cristian 2026-10-12): migrar el
envío a la API HTTPS de Resend (recomendado por la propia Railway) en vez de
subir a Railway Pro. Esto implica dejar de soportar SMTP propio por gym —
Resend verifica un dominio por cuenta, no credenciales arbitrarias por
tenant. Dominio elegido: `tribu-box.cl` (comprado en NIC.cl para este fin).

**Hecho**:
- `apps/api/src/lib/email.ts` reescrito: `sendEmail()` usa la API HTTPS de
  Resend (`RESEND_API_KEY`) cuando está configurada; sin esa variable (dev
  local) cae al fallback de Ethereal de siempre — mismo comportamiento que
  antes, sin necesidad de cuenta de Resend para desarrollar localmente.
  `buildFrom()` sigue poniendo el nombre del gym como display name del
  remitente; solo la dirección de envío (`RESEND_FROM_EMAIL`) es compartida
  entre todos los gyms.
- Campos `gym.smtpHost/smtpUser/smtpPass/smtpFrom` y la config SMTP de
  plataforma quedan sin uso (no se borró el schema ni la UI de
  `/superadmin/config` — limpieza pendiente, no bloqueante).
- Tests actualizados en `email.test.ts` (27 tests, mock de `fetch` para los
  casos con `RESEND_API_KEY`).

**Setup de infraestructura** (Cristian, fuera del repo, 2026-10-12/13):
dominio comprado en NIC.cl (`tribu-box.cl`), DNS delegado a Cloudflare (NIC.cl
no permite editar registros TXT/CNAME directamente, solo elegir nameservers),
subdominio `updates.tribu-box.cl` verificado en Resend (DKIM + 2 CNAME de SPF
+ DMARC opcional), `RESEND_API_KEY`/`RESEND_FROM_EMAIL`
(`notificaciones@updates.tribu-box.cl`) cargadas en Railway para `api` en
`production` y `staging` vía `railway variables set`.

**Verificado con un envío real de punta a punta** (2026-10-13): `POST
/gyms/me/email-test` contra producción → email recibido en una casilla real
(outlook.com) con remitente `QA Apertura Producción 2
<notificaciones@updates.tribu-box.cl>`, asunto y cuerpo correctos.

**De paso, un segundo bug encontrado al revisar el código de email**:
`forgotPassword()` (`auth.service.ts`) tenía su propio SMTP duplicado, nunca
migrado a Resend — "Olvidé mi contraseña" seguía roto en producción pese al
fix anterior. Corregido (reusa `sendEmail()`/`buildFrom()` de `lib/email.ts`,
de paso escapando HTML que antes se interpolaba crudo). Verificado con envío
real: llega correctamente.

Rebrand FitApp → Tribu-Box aplicado a todo lo que ve el usuario (correos,
panel de superadmin, web, mobile) — confirmado visualmente en los dos
correos de prueba (bienvenida y recuperar contraseña), ambos con el footer
"Powered by Tribu-Box" correcto. El correo de bienvenida y el de recuperar
contraseña ahora también usan el logo de plataforma (`/superadmin/config`)
si hay uno subido; sin logo, caen al emoji de siempre (comportamiento
esperado, no un bug).

Objetivo 1 ya no tiene ningún hallazgo abierto de email.

## Hallazgo H-PROD-UX-01 — input de hora en crear/editar clase mostraba AM/PM — **CORREGIDO** (PR #96)

`<input type="time">` nativo sigue el locale del navegador/OS para 12h vs
24h, no algo que controle el código. Cristian lo encontró queriendo poner
"13:00" sin elegir AM/PM al crear una clase real. Fix: `lang="es-CL"` en los
4 inputs de hora (crear clase, editar clase) fuerza 24h en Chrome
independientemente del navegador.

## Pendiente del Objetivo 1

- [x] Gym creado (`qa-apertura-produccin-2`, `prueba4`, tras un par de
  reintentos por H-SUPERADMIN-01/02).
- [x] Email transaccional funcionando de punta a punta: bienvenida,
  recuperar contraseña (H-PROD-EMAIL-01 + fix de `forgotPassword`).
- [x] Rebrand FitApp → Tribu-Box verificado visualmente en los correos.
- [x] Coach creado (`/dashboard/staff`).
- [x] Alumnos creados (`/dashboard/users`) — sin correo de bienvenida, por
  diseño (backlog, ver memoria `project_welcome_email_staff_backlog`).
- [x] Tipos de clase + horario (`/dashboard/settings/class-types`,
  `/dashboard/classes/new`) — encontrado y corregido H-PROD-UX-01 (hora
  AM/PM) en el camino.
- [x] Planes de membresía (`/dashboard/plans`).
- [x] WOD creado (`/dashboard/wods/new`).

**Objetivo 1 completo.** Siguiente: Objetivo 2 (usabilidad del alumno —
reservar, ver WOD, registrar resultado, pagar) sobre los datos ya creados en
`prueba4`.
