# QA — Comunicaciones y plantillas de correo

> Charter: `qa/charters/comunicaciones.md` (COM-01..02). Gym `qa-box-norte`,
> fecha 2026-10-07. Probado vía API directa (curl) y en vivo con
> Playwright contra `/dashboard/communications`.

## Confirmado funcionando (sin cambios)

- [x] **Conteo por segmento coincide con los datos**: comparé el conteo
      real en DB contra lo que devuelve `POST /messages/push` para los 5
      segmentos — `all`=5, `active`=2, `inactive`=3, `expiring`
      (7 días)=1, `plan` (QA Mensual)=2 — todos exactos.
- [x] **Asunto/cuerpo vacío**: bloqueado en dos capas — el HTML
      (`required` en los inputs) y el backend (`z.string().min(1)` en
      `pushSchema`/`emailSchema` de `messages.routes.ts`), no solo
      confianza en el navegador.
- [x] **Doble clic en enviar**: el botón se deshabilita (`disabled={sending}`)
      mientras la request está en curso — cubre el caso normal de doble
      clic en la UI. No hay protección de idempotencia a nivel de API
      (dos requests concurrentes desde dos pestañas sí duplicarían el
      envío), pero es una herramienta interna de uso ocasional por el
      admin del gym, no vale la pena la complejidad de una idempotency
      key para este caso.
- [x] **Push vs Email**: tabs independientes, cada uno con su propio
      formulario y estado — sin interferencia entre ambos.

## Hallazgo H-COM-01 — ni push ni email mostraban cuántos destinatarios recibieron el mensaje — **CORREGIDO 2026-10-07**

El charter pide confirmar que "el conteo coincide con los datos" — y el
conteo del backend SÍ era correcto (ver arriba), pero **nunca llegaba a
mostrarse en pantalla**. `handleSendPush` mostraba siempre el mismo
`"Notificación enviada correctamente"` sin importar si llegó a 5
alumnos o a 0; `handleSendEmail` hacía lo mismo con
`"Email enviado correctamente"` en su rama de éxito. La API ya devolvía
`totalRecipients`/`sent` en la respuesta — el dato estaba, nadie lo leía.

**Por qué importa**: un admin que elige mal el segmento (ej. "Alumnos
inactivos" en vez de "Solo alumnos activos") no tenía ninguna señal de
que el mensaje fue a las personas equivocadas — ni el número de
alumnos del segmento, ni cuántos realmente lo recibieron. Peor: si el
segmento elegido no tenía a **nadie** (0 alumnos), tanto push como
email mostraban igual el mensaje de éxito genérico, sin avisar que no
se envió a absolutamente nadie.

**Fix**: ambos handlers en `apps/web/app/dashboard/communications/page.tsx`
ahora leen `data.totalRecipients`/`data.sent` de la respuesta y arman
el mensaje según el caso:
- 0 destinatarios en el segmento → error claro ("No hay alumnos en
  este segmento — no se envió a nadie.").
- Push con destinatarios pero 0 con token válido → aviso específico
  ("N alumno(s) en este segmento, pero ninguno tiene notificaciones
  push activas en su celular.").
- Éxito real → mensaje con el conteo ("Notificación enviada a N de M
  alumno(s) del segmento." / "Email enviado a N de M alumno(s) del
  segmento.").
- La rama de fallos SMTP de email (`failed > 0`) ya mostraba el conteo
  de antes, sin cambios ahí.

**Verificado en vivo** (Playwright, gym QA Norte, admin): segmento
"Solo alumnos activos" (2 en DB) → push mostró exactamente *"2
alumno(s) en este segmento, pero ninguno tiene notificaciones push
activas en su celular"* (correcto: los usuarios de seed no tienen
token push real). `pnpm typecheck` y `eslint` limpios (solo warnings
preexistentes no relacionados).

## Hallazgo H-COM-02 — el cuerpo del correo (y el nombre del alumno/gym) se insertaban sin escapar en el HTML del email — **CORREGIDO 2026-10-07**

El charter pide probar explícitamente "con HTML/JS en el cuerpo". Encontré
que `apps/api/src/lib/email.ts` arma el HTML de **todos** los correos
(recordatorios automáticos, confirmación de pago, bienvenida, prueba de
SMTP, y el envío masivo de este módulo) interpolando texto de usuario
**sin escapar** directo dentro de un template literal HTML:

```js
`<p style="...">${bodyText}</p>`   // bodyText = lo que el admin escribió, tal cual
```

Esto afecta tanto al **cuerpo** que el admin escribe en "Enviar correo
electrónico" como al **nombre del alumno** (`{{nombre}}`) y al
**nombre del gym** — ambos terminan en el `<h1>` del header y en el
footer de cada correo vía `wrapInLayout`.

**Por qué importa, dos escenarios reales**:
1. **Accidental**: un admin escribe un cuerpo normal que por casualidad
   tiene un `<` o un `&` (ej. "atención: 3 < 5 clases restantes") → el
   HTML del correo queda roto para el que lo recibe, el texto después
   del `<` puede desaparecer o interpretarse como una etiqueta.
2. **Intencional**: un admin (cuenta legítima o comprometida) puede
   escribir HTML completo en el cuerpo — un link de phishing con el
   estilo de un botón, disfrazado como si viniera del sistema oficial
   de FitApp — y se envía a todos los alumnos del gym con el logo y
   diseño "de confianza" de la plataforma envolviéndolo. La ejecución
   de `<script>` en sí la bloquean los clientes de correo modernos
   (Gmail, Outlook, etc. lo descartan siempre), pero el phishing visual
   y la rotura de layout son reales y no dependen de eso.

**Repro en vivo**: con un test que mockea `sendMail` y lee el `html`
real armado por el código, probé `body: '<script>alert(1)</script> & <b>hola</b>'`
y confirmé que quedaba insertado tal cual en el HTML enviado — y
`recipients: [{ name: '<img src=x onerror=alert(1)>', ... }]` quedaba
igual de crudo en el saludo del correo.

**Fix**: nuevo helper `escapeHtml()` en `apps/api/src/lib/email.ts`
(escapa `& < > " '`), aplicado en los 6 puntos donde texto de usuario
se inserta en el HTML del correo:
`sendExpiryReminder`, `sendPaymentConfirmation`, `sendBulkEmail`,
`sendBulkToGyms`, `sendWelcomeEmail`, `sendTestEmail`. El caso más
delicado: `replacePlaceholders()` se usa tanto para el **asunto**
(texto plano, no debe escaparse — se vería "&amp;" literal en el
asunto) como para el **cuerpo** (sí debe escaparse) — se resolvió
escapando el *template* del cuerpo y las *variables* por separado solo
en las llamadas que arman el body, dejando el asunto intacto.
`wrapInLayout()` (el envoltorio común de todos los correos) ahora
escapa `gymName`/`headerTitle` una sola vez, en el único lugar donde
confluyen todos los callers — evita escapar dos veces en distintos
puntos.

**Verificado**: 3 tests nuevos en `src/lib/__tests__/email.test.ts`
(`<script>` + `&` en el cuerpo de `sendBulkEmail` → escapado; nombre de
alumno con `<img onerror=...>` → escapado en el saludo; nombre de gym
`<b>Evil Gym</b>` → escapado en el footer de `sendExpiryReminder`).
Confirmado con revert manual (`git stash` de `email.ts`) que los 3
fallan sin el fix — el `expect` mostró el HTML real con
`<img src=x onerror=alert(1)>` embebido tal cual en el `<h1>` y el
`<p>` del correo. Suite completa de `email.test.ts` (26/26) y de toda
la API (1106/1106) corriendo en verde después del fix, sin regresión
en ninguna otra suite.
