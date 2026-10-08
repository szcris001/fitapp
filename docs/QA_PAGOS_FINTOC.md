# QA — Fintoc (conciliación bancaria + Fintoc Pay)

> Cristian pidió empezar el QA de pagos por Fintoc y dejar las 8 pasarelas
> de cobro (Stripe, Mercado Pago, Khipu, Flow, PayU, Kushki, OpenPay, MACH)
> en backlog por ahora — no se tocan en esta ronda. Fecha: 2026-10-06.
>
> **Importante — son dos features distintas bajo el nombre "Fintoc"**,
> aclarado recién a mitad de esta ronda porque al principio probé solo la
> primera sin saber que había una segunda:
> 1. **Conciliación bancaria** (`/dashboard/fintoc`, admin) — calza
>    transferencias manuales que el alumno ya hizo por su cuenta con su
>    membresía pendiente. Sección "Conciliación bancaria" más abajo.
> 2. **Fintoc Pay / "Pay by Bank"** (checkout del alumno, mobile) — el
>    alumno se conecta a su banco desde la app y paga ahí mismo, sin pasar
>    por conciliación. Es lo que Cristian realmente quería probar primero.
>    Sección "Fintoc Pay" más abajo — acá apareció el hallazgo más
>    importante de esta ronda.

## Conciliación bancaria — alcance probado

Charter de referencia: `qa/charters/conciliacion.md` (casos FIN-01..03 de
`docs/TESTING_STRATEGY.md` §4; FIN-04, el widget real de Fintoc, es manual
y no se prueba acá).

Entorno: local (`qa-box-norte`, admin `admin@qa-norte.test`), datos del
seed (`pnpm seed:qa`): link Fintoc de prueba con token falso + 2
movimientos — uno `MATCHED` por RUT (Fernanda, $35.000, calza con su
membresía `transferStatus: PENDING_REVIEW`) y uno sin identificar
($12.345, RUT `99.999.999-9`).

## Resultado — flujo feliz y bordes probados en vivo (navegador real vía Playwright)

- [x] **Confirmar el match de Fernanda** → modal muestra el `membershipId`
      pre-cargado y deshabilitado ("Ya vinculado automáticamente por el
      matcher") → al confirmar: el movimiento pasa de `Coincidencias` a
      `Confirmados`; en DB, la membresía de Fernanda pasa de
      `INACTIVE`/`transferStatus: PENDING_REVIEW` a
      `ACTIVE`/`transferStatus: CONFIRMED` — sale de "pendientes de
      revisión" como se espera.
- [x] **Rechazar el movimiento sin identificar** → pasa de `Pendientes` a
      `Rechazados`; la fila ya no tiene botones de acción ("Confirmar"/
      "Rechazar" no aparecen para movimientos `REJECTED`, solo `—`).
- [x] **"Volver a intentar confirmarlo" después de rechazado** (pedido
      explícito del charter: "intentar romper") — la UI ya lo bloquea
      ocultando los botones, pero además lo probé **directo contra la API**
      (bypaseando la UI) llamando `PATCH .../confirm` y `PATCH .../reject`
      sobre el movimiento ya `REJECTED`: ambos devuelven `400 "Este
      movimiento ya fue procesado"`. El guard está en el service
      (`confirmBankMovement`/`rejectBankMovement`,
      `payments.service.ts:1680-1750`), no solo en el cliente — no hay
      forma de reprocesar un movimiento ya resuelto ni atacando la API
      directo.
- [x] **Validación de monto/moneda al confirmar** (código revisado, ya
      existente, con su propio comentario explicando el por qué: "sin
      esto, una transferencia de $12.345 podía activar un plan de
      $35.000") — confirmado que el service rechaza si
      `movement.amount < membership.pricePaid` o si la moneda no calza.
- [x] **Sincronizar con el link falso** (`linkToken: 'qa_link_token_no_real'`,
      sin `FINTOC_API_KEY` configurada en `.env` local) → falla con un
      mensaje claro y entendible: *"Fintoc no está configurado
      (secretKey/publicKey)"*, vía `alert()`. La página no se rompe, no
      hay pantalla en blanco ni estado colgado — confirmado con F5 y
      navegación atrás/adelante después del intento.
- [x] Reload (F5) y navegación atrás/adelante en la pantalla de
      conciliación — sin errores nuevos ni estados inconsistentes.

## Hallazgos nuevos (menores, no bloqueantes, no específicos de Fintoc)

Encontrados de pasada mientras diagnosticaba un error de consola que al
principio parecía venir del flujo de Fintoc y en realidad viene del
**login** — se dispara en cualquier carga de la app, no solo en
conciliación.

#### H-PAGOS-01 — URL de assets de plataforma queda mal formada (`?v=...?v=...`) — **CORREGIDO 2026-10-06**

`apps/web/app/login/page.tsx` líneas 47-54: el backend
(`GET /api/platform/assets`) ya devuelve cada asset con su propio
cache-bust embebido en el path (ej.
`/uploads/assets/platform_logo.png?v=1775684948510`), y el login le pega
**otro** `?v=${Date.now()}` sin chequear si el path ya tiene un `?`:

```js
const v = `?v=${Date.now()}`
if (data.assets?.platform_logo) setPlatformLogo(`${API_BASE}${data.assets.platform_logo}${v}`)
```

Resultado: `platform_logo.png?v=1775684948510?v=1791316572789` — un solo
signo `?` debería ser `&` en el segundo. Probado directo con `curl`: el
servidor **no se rompe** (200 OK, trata todo como un único query param
`v` con el signo `?` literal adentro del valor) — es cosmético/inválido
pero no causa un error visible hoy. Mismo patrón que `mediaUrl()` en
`lib/api.ts` **sí maneja bien** (`path.includes('?') ? '&' : '?'`); el
login no usa ese helper para estos dos assets y por eso no hereda el
fix.

**Fix**: nuevo helper local `withCacheBust(path)` en `login/page.tsx` que
aplica la misma lógica que `mediaUrl()` (`&` si el path ya trae `?`, `?`
si no) para los dos assets del login (`platform_logo`,
`login_logo_animated`).

#### H-PAGOS-02 — el logo animado del login nunca se ve (iframe bloqueado por X-Frame-Options) — **CORREGIDO 2026-10-06**

El login intenta mostrar un logo animado embebiendo
`/uploads/assets/login_logo_animated.html` en un `<iframe>`
(`app/login/page.tsx` línea 139). La API sirve ese archivo con
`X-Frame-Options: sameorigin` (viene de `@fastify/helmet`, configurado
globalmente en `src/index.ts`) — y como la web y la API corren en
**orígenes distintos** (puertos distintos en local; probablemente
subdominios distintos de Railway en producción también, salvo que se
unifiquen con un proxy/dominio propio), el navegador bloquea el iframe:
`Refused to display '...' in a frame because it set 'X-Frame-Options' to
'sameorigin'`.

**No era un bug visible para el usuario**: el componente ya tenía un
fallback gracioso — mientras `iframeReady` fuera `false` (nunca llegaba a
`true` si el iframe no cargaba), se seguía mostrando el logo estático.

**Por qué el iframe no era arreglable solo con el header**: pedí sacar
`X-Frame-Options` para esta ruta puntual (ya documentada como pública en
`CLAUDE.md`) y Cristian lo rechazó — correcto, tocar un header de
seguridad para un problema cosmético no vale la pena, y además **no
hubiera alcanzado**: `handleLogoLoad` leía
`iframeRef.current?.contentDocument?.querySelector('svg')` para calcular
el aspect ratio, y esa lectura está bloqueada por la política de
same-origin del navegador sin importar `X-Frame-Options` — con el header
sacado el iframe hubiera cargado, pero el cálculo del ratio hubiera
seguido fallando en silencio (el `try/catch` lo traga).

**Fix real, sin tocar ningún header**: en vez de un `<iframe>`, el
`login_logo_animated.html` (confirmado que es solo `<style>` + `<svg>`,
sin `<script>`, lo sube el superadmin) se trae con `fetch()` y se inserta
directo en la página (`dangerouslySetInnerHTML`). El ratio del aspect
ratio box ahora se calcula con una regex sobre el texto del `viewBox`
(no se depende de un `ref` al DOM). Esto resuelve el bloqueo de
`X-Frame-Options` y el problema de same-origin a la vez, sin cambiar
ninguna cabecera de seguridad — la causa de fondo era usar un iframe
cross-origin para contenido que en realidad es propio y de confianza.

**Verificado en vivo** (Playwright, antes y después del fix): 0 `iframe`
en el DOM, el `<svg>` aparece en el documento principal con el tamaño y
aspect ratio correctos (480×165px, calza con el `viewBox` real de
120/348), sin el error de consola de `X-Frame-Options`. `pnpm lint` y
`tsc --noEmit` limpios (el primer intento de fix disparó una regla de
lint sobre `setState` dentro de un `useEffect` — se corrigió calculando
el ratio al recibir el HTML, no en un efecto separado leyendo el DOM).

#### H-PAGOS-03 — no existe "desconectar" la cuenta bancaria de Fintoc

El charter pide probar "Desconectar/reconectar (sin completar el widget
real)". Revisado el código: **no existe esa función en absoluto**, ni en
el backend (`grep` de todas las rutas `/payments/fintoc/*` —
`link`, `link-intent`, `link/exchange`, `sync`,
`movements/:id/confirm`, `movements/:id/reject`; ninguna es un `DELETE`
ni limpia el `FintocLink`) ni en el botón del web (`app/dashboard/fintoc/page.tsx`
solo tiene "Conectar cuenta bancaria" cuando no hay link, y "Sincronizar"
cuando sí hay uno — no hay tercera opción). Si un gym conecta la cuenta
bancaria equivocada, hoy no hay forma de desvincularla desde el producto
— solo iría por SQL directo. No lo implementé porque no se pidió;
queda anotado para que `product-owner` decida si es necesario para esta
versión o backlog, igual que H-MOBILE-02.

## No probado en esta ronda (explícitamente fuera de alcance)

- Las 8 pasarelas de cobro (Stripe, Mercado Pago, Khipu, Flow, PayU,
  Kushki, OpenPay, MACH) — Cristian las dejó en backlog para retomar
  después de Fintoc.
- FIN-04 (widget real de Fintoc, conexión de cuenta bancaria real) — es
  manual por diseño del charter, no se automatiza.
- Filtros por estado (tabs Pendientes/Coincidencias/Confirmados/Rechazados)
  probados; paginación no se pudo ejercitar con los datos del seed (solo
  2 movimientos, el límite de página es 50).

### Cierre de conciliación bancaria (2026-10-06)

Resumen de esta sub-sección: 2 hallazgos corregidos (H-PAGOS-01/02), 1
hallazgo nuevo sin implementar para decisión de producto (H-PAGOS-03),
flujo feliz y los bordes pedidos por el charter (FIN-01..03) verificados
en vivo. Pendiente: `product-owner` decide H-PAGOS-03.

## Fintoc Pay — el alumno paga conectando su banco desde la app

Esto es lo que Cristian quiso decir con "empecemos con Fintoc": el
alumno elige "Fintoc Pay" como forma de pago en `PlanesScreen.tsx`
(mobile), la app abre el widget de Fintoc en un WebView, el alumno
autoriza el pago desde su banco, y eso activa la membresía por webhook
(`POST /payments/webhook/fintoc-pay`) — sin pasar por la pantalla de
conciliación de arriba.

### Hallazgo H-PAGOS-04 — Fintoc Pay era imposible de usar desde mobile (nombre de pasarela no coincidía) — **CORREGIDO 2026-10-06**

**No era un problema de falta de sandbox real — era un bug que lo
rompía incluso antes de llegar ahí.** El backend identifica esta
pasarela internamente como `'fintocPayments'` (así la lee
`gatewayConfig(gym, 'fintocPayments')` en `payments.service.ts`, y así
la devuelve `GET /payments/gateways` — confirmado con curl:
`{"gateways":["fintocPayments"]}`). Pero `PlanesScreen.tsx` (mobile)
tenía **todas** sus referencias a esta pasarela escritas como
`'fintoc_pay'` (snake_case, con guión bajo) — un nombre que el backend
nunca envía:

- `GATEWAY_LABEL['fintoc_pay']`, `GATEWAY_ICON['fintoc_pay']`,
  `GATEWAY_CHECKOUT_PATH['fintoc_pay']` — ninguno hacía match con el
  valor real `'fintocPayments'`, así que quedaban `undefined`.
- Más grave: la condición `method === 'fintoc_pay'` que decide si se usa
  el handler correcto (`handleFintocPay`, que sí arma bien la llamada y
  lee `widgetUrl`/`paymentIntentId`) **nunca era `true`** — el flujo
  caía siempre en la rama genérica `handleOnlineCheckout(method)`, que
  intenta `GATEWAY_CHECKOUT_PATH['fintocPayments']` → `undefined` →
  `api.post(undefined, ...)`. Además esa rama genérica lee `data.url`,
  que tampoco existe en la respuesta de Fintoc Pay (el backend devuelve
  `widgetUrl`, no `url`).

En criollo: el botón de Fintoc Pay existía, mostraba el label y el
ícono por defecto (fallback `|| m`, mostraba literalmente
`"fintocPayments"` como texto), pero **tocarlo nunca podía funcionar**,
ni siquiera para llegar al punto de fallar por falta de credenciales
reales. Nadie lo iba a notar probando otras pasarelas porque cada una
de las otras 7 sí tiene su key en minúscula simple
(`stripe`, `mercadopago`, `flow`, `khipu`, `payu`, `kushki`, `openpay`,
`mach`) consistente entre backend y mobile — Fintoc Pay fue la única
que se armó con nombres distintos en cada lado.

**Fix**: renombrado `'fintoc_pay'` → `'fintocPayments'` en las 6
ocurrencias de `PlanesScreen.tsx` (los 3 diccionarios +
las 3 comparaciones `method === ...`). Cambio solo en mobile — no se
tocó nada de `apps/api/src/modules/payments` (módulo exclusivo de
`payments-specialist`).

**Verificado en vivo en el emulador** (login como `member@qa-norte.test`,
gym QA Norte con `fintocPayments` habilitado temporalmente con
credenciales falsas para la prueba, limpiado después):
1. **Antes del fix** (inferido por lectura de código + confirmado que
   `GATEWAY_CHECKOUT_PATH['fintocPayments']` es `undefined`): el botón
   jamás hubiera llamado a `handleFintocPay`.
2. **Después del fix**: Mi Plan → Planes disponibles → Contratar plan →
   selector de pago muestra correctamente "🏦 Fintoc Pay" (ícono y label
   bien, antes hubiera mostrado el string crudo) con el texto
   explicativo correcto ("Se abrirá el widget de Fintoc dentro de la
   app...") y el botón "Pagar con Fintoc Pay" → al tocar, llama al
   handler correcto, llega hasta la API real de Fintoc (sin credenciales
   reales) y falla con un `Alert` claro: "Error — No se pudo iniciar el
   pago" — mismo comportamiento gracioso que ya vimos en conciliación
   con el link falso, ahora confirmado también acá. Verificado en DB que
   no quedó ningún `FintocPaymentIntent` huérfano tras el intento
   fallido.
3. `pnpm typecheck` en `apps/mobile` limpio.
4. Código de backend ya tenía 19/19 tests pasando
   (`fintoc-pay.integration.test.ts`) — confirmado que el bug era
   exclusivamente del lado mobile, el backend siempre estuvo bien.

### Qué falta para probar Fintoc Pay de punta a punta con un pago real

Igual que las 8 pasarelas de cobro: hace falta una cuenta de
desarrollador real en Fintoc (API key de sandbox) — no está
documentado todavía en `docs/SANDBOX_SETUP.md` (ese doc solo tiene
Stripe y Mercado Pago completos; Fintoc solo tiene 2 líneas de
variables de entorno comentadas). Con eso se podría completar el widget
real y validar el webhook de activación de membresía end-to-end.

## Cierre de esta ronda (2026-10-06)

Resumen: 3 hallazgos corregidos (H-PAGOS-01/02 de conciliación,
H-PAGOS-04 de Fintoc Pay — este último el más importante, dejaba la
pasarela completamente inutilizable), 1 hallazgo sin implementar para
decisión de producto (H-PAGOS-03). Conciliación bancaria validada de
punta a punta con datos seed. Fintoc Pay validado hasta el límite de la
API real de Fintoc (falla con gracia, como las demás pasarelas) —
falta sandbox real para un pago completo. Pendiente: `product-owner`
decide H-PAGOS-03; crear cuenta de desarrollador Fintoc si se quiere ir
más allá; las 8 pasarelas de cobro siguen en backlog hasta que se
retomen explícitamente.
