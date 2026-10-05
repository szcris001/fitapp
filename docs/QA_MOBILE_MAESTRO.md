# QA Mobile con Maestro — pauta operativa

> Esto es una pauta de trabajo (runbook), no un documento de arquitectura.
> Describe el entorno que ya se armó en esta máquina y el checklist pendiente
> de correr para probar `apps/mobile` de punta a punta: reservas y los 3
> modos de asistencia (`manual`, `qr`, `geo`). Se usa junto con
> `docs/PLAN_DE_PRUEBAS_PRODUCCION.md` (ese es sobre Railway; este es sobre
> probar el mobile real, hoy contra la API local).

## 0. Estado del entorno (ya armado, 2026-10-05)

- Maestro CLI instalado (`~/.maestro/bin`, v2.11.0) y agregado como servidor
  MCP de Claude Code (`claude mcp add maestro -- maestro mcp`).
- Android SDK en `~/Android/Sdk` (`cmdline-tools`, `platform-tools`,
  `emulator`, `platforms;android-34`, `system-images;android-34;google_apis;x86_64`).
  Variables de entorno agregadas a `~/.bashrc`/`~/.zshrc`
  (`ANDROID_HOME` + `PATH`) — en una terminal nueva ya están disponibles.
- AVD creado: `fitapp_test` (Pixel 6, Android 14, x86_64).
- `apps/mobile/src/lib/api.ts` → `API_BASE` cambiado de `192.168.100.21`
  (IP vieja, ya no existe) a **`10.0.2.2`** (alias del emulador hacia el
  localhost del host). **Este cambio es local, no se comitea** — si se
  prueba contra un celular físico en vez del emulador hay que volver a una
  IP de LAN real, o contra producción, a la URL pública.

## 1. Cómo retomar (si la sesión se reinició)

```bash
export ANDROID_HOME="$HOME/Android/Sdk"
export PATH="$PATH:$HOME/.maestro/bin:$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator"

# 1. Infra local (si no está corriendo)
cd ~/fitapp && docker compose up -d        # Postgres + Redis
cd apps/api && pnpm dev &                  # API en :3001

# 2. Emulador (si no está corriendo)
emulator -avd fitapp_test -no-snapshot-save &
adb wait-for-device
until [ "$(adb shell getprop sys.boot_completed | tr -d '\r')" = "1" ]; do sleep 3; done

# 3. App mobile en el emulador
cd ~/fitapp/apps/mobile && pnpm android
```

Confirmar que Maestro ve el dispositivo: `maestro --device emulator-5554 hierarchy`.

### Gotchas ya encontrados
- Al abrir por primera vez, Expo Go muestra el **developer menu** encima del
  login — se cierra con un flow Maestro (`appId: host.exp.exponent` +
  `tapOn: "Continue"`), **no** con el botón físico atrás: el botón atrás saca
  de la app entera al launcher de Expo Go.
  ```yaml
  appId: host.exp.exponent
  ---
  - tapOn: "Continue"
  ```
- Si eso pasa, reabrir con:
  `adb shell am start -a android.intent.action.VIEW -d "exp://<IP_LAN_DEL_HOST>:8081" host.exp.exponent`
  (la IP de LAN la imprime `pnpm android` al arrancar, ej. `192.168.18.76:8081`
  — ojo que esto es distinto de `10.0.2.2`, que solo vale *dentro* del emulador).
- El warning de `expo-notifications` al bootear es esperado (Expo Go no
  soporta push desde SDK 53) — no es un bug a investigar. Al loguearse por
  primera vez aparece además un diálogo nativo de Android pidiendo permiso de
  notificaciones ("mobile needs permissions for posting notifications...") —
  tocar Deny/Allow, cualquiera sirve para el testing.
- **`openLink` no reinicia el estado de React.** Trae la app al frente pero
  reutiliza la instancia ya montada — si un campo de texto quedó con basura
  de un flow anterior (ej. un `tapOn` que falló a mitad de camino), el
  siguiente flow hereda esa basura y `eraseText` puede no alcanzar a
  limpiarla del todo. Si un flow falla a medio camino, antes del siguiente
  intento conviene `adb shell am force-stop host.exp.exponent` (fuerza un
  cold start real) en vez de confiar en `openLink` + `eraseText` solo.
- El login de un gym (`LoginScreen.tsx`) **requiere el campo GIMNASIO**
  (slug) pese a que el hint dice "(opcional)" — sin él,
  `POST /auth/login` solo busca usuarios `SUPER_ADMIN`
  (`auth.service.ts:138-155`, rama `if (!data.gymSlug)`) y cualquier
  ADMIN/COACH/MEMBER real devuelve `401 Credenciales inválidas` aunque la
  contraseña sea correcta. El slug de los gyms QA es `qa-box-norte` /
  `qa-box-sur` (ver `qa/fixtures.json`). Esto puede ser un hallazgo de UX
  real (el hint miente para el caso no-superadmin) — no se investigó más a
  fondo todavía, queda anotado acá.
- Los taps por coordenadas fijas (`tapOn: {point: "x,y"}`) son poco
  confiables en este login: el fondo tiene un carrusel de imágenes
  animado y el layout se reacomoda unos px al abrir el teclado, así que
  las bounds leídas de un `hierarchy` quedan desactualizadas rápido. Usar
  selectores relativos (`tapOn: {below: "ETIQUETA"}`), que Maestro
  recalcula en el momento del tap, no coordenadas fijas.
- **El toast de `expo-notifications` interfiere con la barra de tabs.** Es
  un banner fijo pegado abajo de la pantalla; un `tapOn` apuntado a un tab
  (`Clases`, `Perfil`, etc.) puede aterrizar sobre el toast en vez del tab
  y abrir el LogBox de error de Expo Go a pantalla completa. Agregar un
  `tapOn: {text: "Dismiss", optional: true}` antes de cualquier navegación
  por bottom-tabs no cuesta nada y evita el problema.
- **`pnpm seed:qa` invalida la sesión logueada.** El script borra y recrea
  los gyms QA desde cero (`wipeQaGyms()`), así que el usuario `Mara` después
  de reseedear tiene un `id` nuevo. Si la app mobile ya tenía un token
  guardado en AsyncStorage de ANTES del reseed, ese token sigue siendo
  válido para JWT (firma correcta) pero apunta a un `userId` que ya no
  existe — la UI se ve "logueada" pero todo sale vacío (`Sin membresía
  activa`, `No tienes clases reservadas`, 0 en todos lados) sin ningún
  error visible. Si acabás de correr `seed:qa` con la app ya abierta:
  cerrar sesión (`Perfil` → scroll → `Cerrar sesión` → `Salir`) y loguear
  de nuevo antes de asumir que algo se rompió.
- **El botón "Reservar lugar" de la tarjeta es un atajo a un sheet, no una
  reserva directa** — ver el detalle completo en la sección 3.1 arriba.

## 2. Datos de prueba

Usar los gyms QA ya sembrados (`cd apps/api && pnpm seed:qa`, ver
`apps/api/src/scripts/seed-qa.ts` y `qa/fixtures.json`) — mismos usuarios que
usa la suite Playwright (`QA.gyms.norte`, etc.), contraseña en
`fixtures.password`.

Para los modos `qr`/`geo` hay que togglear `Gym.attendanceMode` (default
`manual`, ver `apps/api/prisma/schema.prisma:58`) — no hay UI para esto en
`seed-qa`, así que se hace a mano, por ejemplo con Prisma Studio o un
`UPDATE` directo contra la DB local, **nunca** contra producción:

```sql
-- modo geo: además necesita gymLat/gymLng (y opcionalmente gymRadiusMeters, default 200m)
UPDATE "Gym" SET "attendanceMode" = 'geo', "gymLat" = -33.45, "gymLng" = -70.65
  WHERE slug = 'qa-norte';

-- modo qr: no necesita coordenadas
UPDATE "Gym" SET "attendanceMode" = 'qr' WHERE slug = 'qa-norte';

-- volver a manual al terminar, para no romper los specs de Playwright que asumen 'manual'
UPDATE "Gym" SET "attendanceMode" = 'manual' WHERE slug = 'qa-norte';
```

## 3. Checklist de pruebas (mobile real, vía Maestro)

Rutas exactas de referencia en `apps/api/src/modules/classes/classes.routes.ts`
y pantallas en `apps/mobile/src/screens/`.

### Flow de login de referencia (ya verificado funcionando)

```yaml
appId: host.exp.exponent
---
- openLink: "exp://<IP_LAN_DEL_HOST>:8081"
- waitForAnimationToEnd
- tapOn:
    text: "OK"
    optional: true   # por si quedó un diálogo de un intento anterior
- tapOn:
    below: "GIMNASIO"
- eraseText: 80
- waitForAnimationToEnd
- inputText: "qa-box-norte"
- waitForAnimationToEnd
- tapOn:
    below: "EMAIL"
- eraseText: 80
- waitForAnimationToEnd
- inputText: "member@qa-norte.test"
- waitForAnimationToEnd
- tapOn:
    below: "CONTRASEÑA"
- eraseText: 80
- waitForAnimationToEnd
- inputText: "QaFitapp2026!"
- waitForAnimationToEnd
- tapOn: "Iniciar sesión.*"
```

### 3.1 Reserva de clase (`attendanceMode` no importa) — ✅ verificado 2026-10-05
- [x] Login como `member` del gym QA (mobile `ClassesScreen.tsx`).
- [x] Reservar una clase próxima → `POST /bookings` (línea 124). Confirmar que
      aparece como reservada en la UI y en `GET /my-bookings`.
- [x] Cancelar la reserva → `DELETE /bookings/:classId`. Confirmar que vuelve
      a aparecer como disponible. **Backend OK, bug visual en el mobile — ver
      hallazgo H-MOBILE-01 abajo.**
- [ ] (Si hay una clase llena) reservar y quedar en lista de espera, luego
      `POST /bookings/:bookingId/confirm` cuando se libera un cupo.

#### Hallazgo H-MOBILE-01 — botón "Reservar lugar" queda invisible (pero funcional) tras cancelar

**Repro**: en `ClassesScreen.tsx`, reservar una clase desde la lista (abre
sheet → confirmar) y después cancelarla desde el sheet (`Cancelar reserva` →
`SÍ, CANCELAR`). La tarjeta de esa clase en la lista vuelve a `0/N` cupos
correctamente, pero el botón degradado "Reservar lugar" (la rama final del
condicional en torno a la línea 455, `<LinearGradient colors={[accentColor,
accentColor + 'AA']}>`) queda **invisible** — ni el fondo con gradiente ni el
texto se pintan, solo queda el espacio vacío de la tarjeta.

**No es solo cosmético pero tampoco rompe la función**: confirmado con
`maestro hierarchy` que el elemento sigue presente con el texto correcto y
es tappable — tocarlo en el lugar donde debería estar abre el sheet de
detalle normalmente, y desde ahí se puede volver a reservar sin problema.
El botón del dentro del sheet (un `LinearGradient` separado, se desmonta y
remonta cada vez que el sheet abre) sí se pinta bien siempre.

**Descartado como falso positivo**: no es un glitch puntual del emulador —
se probó con pull-to-refresh y con scroll (alejar la tarjeta de la lista y
volver a traerla) y el botón sigue sin pintarse; mientras tanto una tarjeta
hermana en la misma lista (otra clase, nunca reservada/cancelada) pinta su
gradiente sin problema. Es específico de la tarjeta cuya reserva pasó por un
ciclo reservar→cancelar en la sesión.

**Hipótesis de causa (no confirmada, para quien lo arregle)**: el
`LinearGradient` de la tarjeta de lista es una instancia persistente (mismo
`key={cls.id}` en todos los re-renders de `fetchAll()`), a diferencia del
del sheet que se remonta. Si en algún render intermedio durante la
transición reservar→cancelar `accentColor` quedó `undefined` por un
instante (ej. mientras `classType` se recalculaba), `accentColor + 'AA'`
habría producido un color inválido (`"undefinedAA"`) — algunas
implementaciones nativas de `LinearGradient` en Android cachean el bitmap
dibujado y no vuelven a pintar correctamente después de un color inválido,
aun recibiendo props válidas después. No se confirmó con un debugger nativo,
queda como pista.

**Severidad sugerida**: baja-media. No bloquea la función (el botón sigue
funcionando a ciegas, y el sheet es la vía alternativa), pero en producción
un alumno real vería una tarjeta sin ningún call-to-action visible y podría
asumir que esa clase no se puede reservar.

**Importante — "Reservar lugar" es un flujo de DOS taps, no uno.** El botón
"Reservar lugar" de la tarjeta en la lista **no reserva directo**: abre un
bottom-sheet de detalle (`GET /classes/:id`, estado `sheetClass`/`sheetDetails`
en `ClassesScreen.tsx`) que tiene su **propio** botón, con el mismo texto
"Reservar lugar", que es el que de verdad dispara `POST /bookings`. Un flow
de Maestro con un solo `tapOn: {text: "Reservar lugar", index: N}` solo abre
el sheet. Hace falta un segundo tap (normalmente `index: 0`, porque dentro
del sheet es la única ocurrencia visible del texto) para confirmar.

Esto generó una falsa alarma en la primera pasada: un tap mal targeteado
sobre un sheet que había quedado abierto de un intento previo (por la
interferencia del toast de `expo-notifications`, ver gotcha más abajo) hizo
que se reservara la clase de **mañana** en vez de la de **hoy**, y por un
momento pareció un bug real de "booking apunta a la clase equivocada". No lo
es — fue un artefacto de encadenar flows sin cerrar bien el sheet anterior.
Verificado con una repetición controlada (logout → login fresco → un tap
→ chequear DB → confirmar en el sheet → chequear DB de nuevo) que el booking
siempre termina en el `classId` correcto cuando el flow no se interrumpe a
mitad de camino.

### 3.2 Asistencia manual y automática — prioridad para esta versión (decidido 2026-10-05)

Cristian decidió: para esta versión solo importan `manual` y `auto`; `qr` y
`geo` quedan en backlog (ver H-MOBILE-02 más abajo, ya no es foco).

- [x] **Manual** — No hace falta probarlo de nuevo en mobile: lo marca el
      coach desde el web (`ClassDetail.tsx`), no hay acción del alumno en
      mobile para este modo, y ya está cubierto por
      `apps/api/src/modules/classes/__tests__/bookings.integration.test.ts`.
- [x] **Automático** — ✅ probado en vivo 2026-10-05. Encontré un desvío real
      (ver H-MOBILE-03) y **ya está corregido** con la especificación que dio
      Cristian en vivo, verificado de nuevo con reloj real.

#### Hallazgo H-MOBILE-03 — "Automático" marcaba asistencia al EMPEZAR la clase, no al terminar — **CORREGIDO 2026-10-05**

**Estado original encontrado**: `apps/web/app/dashboard/settings/page.tsx`
describía "Automático" como *"Se marca al finalizar la clase"*, pero
`runAutoAttendanceJob()` (`apps/api/src/lib/cron.ts`, cron `*/5 * * * *`)
marcaba `ATTENDED` cualquier `Booking` `CONFIRMED` de una clase con
`startsAt <= now` — apenas la clase empezaba, sin ninguna gracia.

**Repro en vivo del estado original**: clase `startsAt` = +1 min,
`endsAt` = +61 min → el booking pasó a `ATTENDED` a los 15:35:00, solo
1m18s después de empezar (`attendedAt: 2026-10-05 15:35:00`,
`startsAt: 15:33:42`, `endsAt: 16:33:42` — 58 min antes de terminar).

**Especificación real** (la dio Cristian al revisar este hallazgo, no es
una suposición mía): el comportamiento de marcar automático sin esperar al
coach está bien — lo único que faltaba era una gracia de **5 minutos**
después de empezada la clase (no apenas arranca), y además: si el **coach**
incorpora a un alumno a una clase que **ya está en curso** ("fuera de
horario"), eso debe marcarse como `ATTENDED` de inmediato, sin esperar el
cron — es el coach confirmando presencia en el momento.

**Cambios aplicados**:
- `apps/api/src/lib/cron.ts` — `runAutoAttendanceJob` ahora filtra por
  `startsAt <= (now - 5 min)` en vez de `startsAt <= now`
  (`AUTO_ATTENDANCE_GRACE_MINS = 5`).
- `apps/api/src/modules/classes/classes.service.ts` —
  `assignUserToClass` ahora marca `ATTENDED` + `attendedAt` de una
  si la clase ya empezó (`cls.startsAt <= now`); si no empezó, sigue
  creando/activando en `CONFIRMED` como antes.
- `apps/web/app/dashboard/settings/page.tsx` — texto corregido a *"Se
  marca solo, 5 min después de que empieza"*.

**Verificado en vivo, dos veces, con reloj real (no solo lectura de
código)**:
1. Gracia del cron: clase A (CONFIRMED insertado directo, `startsAt` hace
   3m21s) y clase B (`startsAt` hace 6m21s) — en el tick de las 15:50:13,
   A siguió `CONFIRMED` (4m48s transcurridos, dentro de gracia) y B pasó a
   `ATTENDED` (7m48s transcurridos, fuera de gracia). Exactamente el corte
   esperado.
2. Asignación del coach: `POST /bookings/assign` sobre una clase con
   `startsAt` hace 10 min → respuesta `status: "ATTENDED"`,
   `attended: true`, `attendedAt` seteado en el mismo request. Sobre una
   clase futura → sigue devolviendo `CONFIRMED` normal (no se rompió el
   caso de siempre).
3. Suite de tests del módulo classes completa: 90/90 verdes después del
   cambio (`pnpm vitest run src/modules/classes`).

**Pendiente, no es bloqueante**: no se agregó un test automatizado para
`runAutoAttendanceJob` (no había archivo de test para `cron.ts` de entrada,
y requeriría `vi.useFakeTimers()` — mismo patrón que ya usa el proyecto
para el auto-renewal de pagos, ver `docs/PLAN_DE_PRUEBAS.md`). La
verificación de arriba fue en vivo contra el cron real, no mockeado — da
confianza pero no deja cobertura de regresión en CI. Si se quiere esa
cobertura, es tarea para `qa-engineer` o `backend-dev`.

**Nota aparte, no investigada a fondo**: el tipo de `attendanceForm` en el
web es `'manual' | 'auto'` pero el schema de Zod del backend
(`gyms.schema.ts` línea 64) acepta `z.enum(['manual', 'auto', 'qr', 'geo'])`
— consistente entre sí, solo lo dejo anotado porque muestra que el backend
ya sabía de los 4 modos desde el schema, reforzando que `qr`/`geo` fueron
construidos con intención y simplemente no se terminó de cablear la UI
(alineado con H-MOBILE-02).

### 3.3 / 3.4 Asistencia QR y Geo — en backlog, no es foco de esta ronda (ver H-MOBILE-02)

**No intentar correr el checklist original de abajo tal cual — ambos modos
están rotos a nivel de navegación, no de lógica.** Verificado 2026-10-05:
antes de gastar tiempo armando flows de Maestro para esto, confirmar primero
si alguien ya lo arregló (`grep -rn "QRScanner\|handleGeoCheckin" src/` en
`apps/mobile`).

#### Hallazgo H-MOBILE-02 — QR y Geo son inalcanzables desde la UI (feature construida pero nunca cableada)

**Geo**: `handleGeoCheckin` (`ClassesScreen.tsx` línea 147) está completo y
correcto — pide permiso de ubicación, llama `Location.getCurrentPositionAsync`,
pega a `POST /classes/:id/attendance/geo`, maneja la respuesta. Pero
**ningún botón en todo el archivo lo llama** (`grep -rn "handleGeoCheckin"
src/` solo encuentra la definición y el `useState` de `geoCheckinId`, cero
call sites). Un alumno nunca puede dispararlo.

**QR**: aún peor — ni el scanner del coach ni el QR del alumno están
conectados:
- `QRScreen.tsx` (pantalla del alumno que muestra su QR) **no está
  registrada en `AppNavigator.tsx`** — no es solo que falte un botón para
  llegar, la pantalla ni siquiera existe como ruta navegable.
- `admin/QRScannerScreen.tsx` (el coach escanea) sí está registrada
  (`AppNavigator.tsx` línea 671, ruta `"QRScanner"`), pero
  `grep -rn "navigate('QRScanner'" src/` no encuentra ningún lugar que
  navegue ahí — no hay botón/ícono que lleve al coach a esa pantalla.

**Y en el web, confirma que nadie puede activar estos modos ni queriendo**:
`apps/web/app/dashboard/settings/page.tsx` línea 216 — el tipo del form es
`'manual' | 'auto'`, y las únicas dos opciones que se muestran en pantalla
(línea ~724) son "Manual" y "Automático" (que ni siquiera es un valor que
reconozca `classes.routes.ts` del backend — ese sería otro hallazgo aparte
si hace falta cavar). **No hay ningún control en el admin web para poner un
gym en modo `qr` o `geo`.** Solo se puede llegar a ese estado escribiendo
directo en la base (como hice yo para esta prueba) — ningún gym real en
producción podría estar en modo QR o Geo a través del producto tal como
está hoy.

**Lo único que sí funciona de punta a punta** (confirmado con los endpoints
reales, API + DB, bypaseando la UI rota): `POST /classes/:id/attendance/qr`
y `POST /classes/:id/attendance/geo` — la lógica de negocio del backend está
bien (validación de modo, Haversine, ventana horaria). El problema es 100%
de cableado en el cliente (mobile) y de configuración (web), no de lógica
de servidor.

**Por qué importa**: esto no es un detalle menor de QA — son dos de los tres
modos de asistencia del producto, completamente inertes. Si esto no es a
propósito (feature a medio construir, pausada), vale la pena que lo vea
`product-owner` antes que nadie más — puede ser una decisión de alcance
("no era MVP, se pausó a propósito") o un gap real que se perdió de vista.

**Para cuando se retome la prueba real** (una vez que alguien cablee los
botones), el plan sigue siendo válido:
```bash
# Togglear modo (no hay UI, hacerlo por SQL en local; en prod sería vía la
# UI de settings una vez que exista esa opción)
UPDATE "Gym" SET "attendanceMode" = 'geo', "gymLat" = ..., "gymLng" = ...
  WHERE slug = 'qa-box-norte';

# Simular GPS del emulador (longitud primero, después latitud)
adb -s emulator-5554 emu geo fix <gymLng> <gymLat>
```
Casos a cubrir una vez que haya UI: check-in dentro de rango → 200; fuera
de rango → 403 con distancia; fuera de la ventana horaria (±30min/+15min
de `classes.routes.ts` líneas ~378-383) → 400. Para QR, escanear una
cámara real con Maestro no es directo (no hay webcam en el emulador) —
alcanza con probar que `QRScreen` muestra el QR y que el scanner consume
bien el payload, sin forzar una cámara simulada.

#### Hallazgo H-MOBILE-04 — "mismo tipo de clase por día" no aplicaba a planes con maxClasses — **CORREGIDO 2026-10-05**

No es un hallazgo de mobile específicamente (es la regla de negocio en
`bookClass`, `apps/api/src/modules/classes/classes.service.ts`, usada tanto
por mobile como por el booking que haga el admin/coach desde el web), pero
queda documentado acá por continuidad con el resto de la sesión.

**Regla pedida por Cristian**: un alumno no puede confirmar dos clases del
mismo tipo el mismo día (ej. CrossFit 17:00 y CrossFit 20:00), **para todos
los tipos de clase, como regla pareja** — sin excepción por plan.

**Estado encontrado**: la regla ya existía en código, pero solo se aplicaba
a planes **sin** `maxClasses` (ilimitados). Los planes **con** `maxClasses`
(ej. trial) solo tenían un límite de *cantidad total* de clases por día,
sin mirar el tipo — un plan trial con `maxClasses=5` podía reservar
CrossFit 19:00 y CrossFit 21:00 el mismo día sin problema.

**Repro en vivo antes del fix**: plan `QA Trial maxClasses` (`maxClasses=5`)
asignado a un alumno de prueba → `POST /bookings` para CrossFit 19:00 y
CrossFit 21:00 el mismo día, **ambas** devolvieron `201 CONFIRMED`.

**Fix**: en `bookClass`, el chequeo de "mismo tipo el mismo día" ahora corre
siempre, sin el `if (!activeMembership.plan.maxClasses)` que lo
condicionaba. El chequeo de `maxClasses` (cantidad total distinta por día)
sigue corriendo además, para los planes que lo tengan — son dos reglas
independientes ahora, no una u otra.

**Verificado**:
- En vivo: mismo repro de arriba, ahora la segunda reserva (mismo tipo)
  devuelve `400 "Ya tienes una clase de CrossFit reservada para ese día"`;
  una clase de **otro tipo** (Halterofilia) el mismo día sigue permitida.
- Suite de tests: 2 tests existentes de `bookings.integration.test.ts`
  (límite trial) usaban 3 clases del mismo tipo el mismo día — rotas por
  este fix porque ahora chocan con la regla nueva antes de llegar a probar
  el límite de `maxClasses`. Se corrigió el fixture (`createClass` ahora
  acepta `classTypeId`, el describe crea 3 `ClassType` distintos) para que
  el test de límite siga aislado de la regla de "mismo tipo". Se agregó un
  test nuevo que cubre exactamente el gap (mismo tipo + plan con
  `maxClasses` → debe bloquear). Confirmado con revert manual que el test
  nuevo falla sin el fix y pasa con él. Suite completa: 91/91 verdes.

**Actualización 2026-10-05 — `assignUserToClass` también la respeta**: al
revisar esto con Cristian salió una corrección importante de proceso: yo
había asumido en silencio que el override del coach debía quedar exento
(mismo criterio que los cutoffs de horario, que el coach sí salta a
propósito). Cristian marcó que no debía suponer eso — se preguntó
explícitamente y la respuesta fue que el coach **también** respeta la regla
de "mismo tipo, mismo día" al usar `POST /bookings/assign`. Esto es
consistente con lo que ya hace `cancelCutoffMins` (30 min por defecto): el
alumno no puede cancelar/moverse solo una vez cerca del horario, y por eso
necesita al coach — pero el coach interviniendo no significa que cualquier
regla de negocio quede sin efecto, solo los *cutoffs de tiempo* (esos sí
noexplícitamente bypaseados, ver `removeStudentByAdmin`, "sin restricción
de tiempo").

Aplicado en `assignUserToClass` (mismo patrón que `bookClass`): si el
alumno ya tiene una clase activa del mismo `classTypeId` ese día, el assign
rechaza con `"El alumno ya tiene una clase de {tipo} reservada para ese
día"`. **"Mover" a un alumno sigue funcionando** sin fricción: mover es
sacarlo primero (`removeStudentByAdmin`, borra la reserva vieja) y después
asignarlo a la nueva — para cuando corre el chequeo de "mismo tipo" en el
assign, la reserva vieja ya no existe, así que no choca contra sí misma.
Lo que sí queda bloqueado es *agregar* una clase extra del mismo tipo sin
sacar la anterior primero.

Verificado con 5 tests nuevos en `assignUserToClass: coach incorpora
alumnos` (`bookings.integration.test.ts`): clase futura → `CONFIRMED`
normal; clase ya empezada → `ATTENDED` inmediato (ver arriba); mismo tipo
mismo día → bloqueado; mover (sacar + asignar mismo tipo) → sigue
funcionando; tipo distinto mismo día → permitido. Confirmado con revert
manual que el test de bloqueo falla sin el fix. Suite completa: 96/96
verdes.

#### Hallazgo H-MOBILE-05 — `maxClasses` contaba por día calendario en vez de por período de la membresía — **CORREGIDO 2026-10-05**

**Estado encontrado**: el plan web muestra `maxClasses` como *"X clases
incluidas"* (`apps/web/app/dashboard/plans/page.tsx` línea 191, vs "Clases
ilimitadas" cuando no tiene tope) — un número para todo el plan, no "por
día". El código en `bookClass` lo contaba con `class.startsAt` acotado al
**día calendario** de la clase que se intenta reservar, reseteando el
contador cada día. Un plan trial con `maxClasses=2` permitía reservar 2
clases **cada día**, indefinidamente — no 2 en total.

**Decisión de Cristian** (consultado, no asumido): el tope debe contarse
sobre el **período real de la membresía activa** del alumno
(`membership.startsAt` → `membership.endsAt`, hoy siempre 30 días vía
`MEMBERSHIP_DAYS`), separado de la pregunta de si esos 30 días deberían ser
configurables por gym — ver nota de alcance más abajo.

**Fix**: en `bookClass`, el conteo de `maxClasses` ahora filtra
`class.startsAt` entre `activeMembership.startsAt` y
`activeMembership.endsAt` en vez de entre el inicio/fin del día calendario.
El mensaje de error también se ajustó ("por día" → "en este período").

**Verificado**: suite completa de `apps/api`: **1098/1098 tests
verdes** (no solo el módulo `classes` — corrida completa para descartar
efectos en otros módulos). Test nuevo específico: plan trial
`maxClasses=2`, dos clases reservadas (tests previos de la misma suite),
una tercera clase en un **día totalmente distinto** (+5 días, mismo
período de 30 días) → sigue rechazada con el mismo error de límite —
antes del fix, al caer en otro día calendario, el contador volvía a cero y
esto se permitía. Confirmado con revert manual que el test falla sin el
fix.

**Nota de alcance — NO implementado, pasado a `product-owner`**: Cristian
también planteó hacer configurable la duración del plan (hoy fija en 30
días vía `MEMBERSHIP_DAYS` en `apps/api/src/lib/membership.ts`, "cada box
decide su configuración"). Investigué el impacto antes de tocar nada:
`MEMBERSHIP_DAYS` está usado extensamente dentro de
`apps/api/src/modules/payments/payments.service.ts` (descripciones de
checkout de Stripe, cálculo de fechas de auto-renovación, facturas) — ese
módulo es **exclusivo de `payments-specialist`** según `CLAUDE.md`, ningún
otro agente lo toca. Además reviviría una decisión ya confirmada dos veces
(2026-06-13 y 2026-09-27, ver comentario en `membership.ts`). Por eso el
fix de `maxClasses` de arriba se hizo usando el período *real* de la
membresía (`startsAt`/`endsAt`, campos que ya existen y reflejan la
duración real sea cual sea), para que funcione sin cambios si esa
configurabilidad se implementa después — pero la implementación de "30 días
configurable por gym" en sí queda pendiente, para que la evalúen
`product-owner` y `payments-specialist`, no la implemento yo.

### 3.5 Limpieza
- [ ] Volver `attendanceMode` a `manual` en los gyms QA tocados, para no
      dejar roto el estado que esperan los specs de Playwright.
- [ ] Si se corrió contra el gym QA Smoke de producción (no este caso, ya
      que todo este checklist es contra la API local): usar el cascade
      delete del superadmin al terminar, como indica
      `docs/PLAN_DE_PRUEBAS_PRODUCCION.md` §4.

## 4. Pendiente — flujo web del coach (no es Maestro/mobile)

Mencionado por Cristian 2026-10-05: en la práctica real, alumnos le piden al
coach que los meta a una clase o los cambie de horario. Confirmado en código:

- **Inscribir a un alumno**: `POST /bookings/assign` (`classes.routes.ts`
  línea 143), UI en `apps/web/app/dashboard/classes/_components/ClassDetail.tsx`
  función `assignStudent` (línea 1108).
- **"Mover de horario" NO existe como acción atómica** — no hay endpoint ni
  botón dedicado. Hoy el coach tendría que hacerlo en dos pasos manuales:
  sacarlo de la clase vieja (`DELETE /bookings/:bookingId/admin`) e
  inscribirlo en la nueva (`POST /bookings/assign`). Vale la pena probar ese
  flujo de dos pasos tal cual existe (no inventar un botón "mover" que no
  está); si se quiere un botón atómico, eso es una decisión de producto
  (consultar a `product-owner`), no algo para agregar de paso en un checklist
  de QA.
- Esto es un flujo del **panel web** (coach/admin), no de la app mobile —
  no se prueba con Maestro. Ya puede estar cubierto por
  `apps/web/e2e/modules/classes.spec.ts`; revisar ahí antes de escribir un
  test nuevo.
