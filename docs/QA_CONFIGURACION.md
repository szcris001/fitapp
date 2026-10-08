# QA — Configuración del gym

> Charter: `qa/charters/configuracion.md` (CFG-01..08). Gym `qa-box-norte`,
> fecha 2026-10-07. Suite E2E existente confirmada en verde (12/12) antes
> y después de las pruebas manuales. Probado vía API directa (curl) +
> `/gyms/me`, `/gyms/me/logo`, `/gyms/me/movements-library`.

## Resultado: módulo sólido, sin hallazgos que corregir

A diferencia de los módulos anteriores de esta ronda (mobile, Fintoc,
WODs, alumno-api, comunicaciones — todos con bugs reales), acá no
encontré nada que corregir. Detalle de lo que probé:

- [x] **Datos del centro — persisten tras guardar**: confirmado con
      `brandColors` (guardar colores → releer → coinciden exacto).
- [x] **Email inválido**: `PUT /gyms/me` con `email: "no-es-un-email"` →
      `400` Zod claro (`"Invalid email address"`).
- [x] **Ventanas de reserva — límites ya protegidos**: `bookingWindowDays`
      acepta 1-7, `bookingCutoffMins`/`cancelCutoffMins` aceptan 0-1440
      (24h). Probé negativo (`-5`) → `400` claro ("Too small..."); enorme
      (`999999`) → `400` claro ("Too big..."); `0` en `cancelCutoffMins`
      → `200`, se guarda bien (0 = sin plazo de corte, caso de uso
      legítimo, no un bug).
- [x] **Logo — SVG rechazado, y el filtro no se puede saltar falseando el
      Content-Type**: subí un SVG con `<script>` adentro dos veces — una
      vez declarado como `image/svg+xml` (rechazado, mensaje claro) y
      otra vez con el Content-Type **falseado** a `image/png` (confirmé
      con `curl --trace-ascii` que el header realmente viajaba así). En
      ambos casos: `400 "Formato no permitido (PNG, JPG o WEBP)"`. El
      código no confía en el Content-Type declarado por el cliente —
      valida la extensión real por la firma de bytes del archivo
      (`detectImageExt(buf)`, ya documentado así en el propio código).
      Buen diseño ya existente, lo dejo confirmado.
- [x] **Pasarelas de pago — secretos bien enmascarados**: guardé un
      `secretKey` de Stripe → la respuesta del `PUT` y el `GET`
      posterior lo devuelven enmascarado (`••••2345`, últimos 4
      caracteres); el campo público (`publishableKey`) se devuelve
      completo, como corresponde. Reenvié el valor enmascarado tal cual
      (simulando un formulario que no tocó ese campo) → confirmado en
      DB que el secreto real **no** se pisó con el placeholder — sigue
      el valor original completo. Diseño ya sólido
      (`apps/api/src/lib/secrets.ts`).
- [x] **Biblioteca de movimientos — duplicados con tildes/mayúsculas**:
      envié `["Sentadilla", "sentadillá", "SENTADILLA", "Peso Muerto"]`
      → quedaron solo 2 (dedupe por nombre normalizado, sin tildes ni
      mayúsculas, ya implementado). "Borrar uno usado en un WOD": no
      aplica como riesgo — `WodMovement.movementName` es texto libre en
      el schema (`prisma/schema.prisma`), no una referencia a esta
      biblioteca, así que borrar una entrada de la biblioteca no puede
      romper ningún WOD existente.
- [x] **Tema/colores de marca**: `brandColors` persiste correctamente
      (ver primer punto).

## Notas, no hallazgos

- **`phone` no tiene validación de formato** (`z.string().optional()`
  sin regex) — acepta cualquier texto, incluido HTML/`<script>`. No lo
  marco como bug: no es un riesgo de seguridad real (React escapa el
  contenido por defecto al mostrarlo en la UI, y el teléfono no se
  interpola en ningún email como sí pasaba con el nombre/cuerpo en
  H-COM-02) — es a lo sumo una validación de formato ausente, y
  endurecerla es una decisión de producto (¿qué formatos de teléfono
  son válidos entre los países donde opera FitApp?) que no me
  corresponde asumir.
- **`paymentGateways` se fusiona, no se reemplaza**: enviar
  `{"paymentGateways": {}}` no borra las pasarelas ya guardadas — el
  merge conserva lo existente cuando no viene nada nuevo para esa
  pasarela (comportamiento documentado a propósito en
  `mergeGateways()`). Lo anoto porque me hizo perder un momento
  limpiando datos de prueba (tuve que limpiar por SQL directo), no
  porque sea un bug — así está diseñado para que el formulario pueda
  reenviar todo sin necesidad de un endpoint de borrado separado.
- **Falso positivo propio, no del producto**: a mitad de las pruebas
  manuales, un `PUT /gyms/me` devolvió `404 "El registro no existe o ya
  fue eliminado"` con stack trace — causado por correr la suite E2E de
  settings (que resiembra el entorno QA) **en paralelo** con mis
  pruebas manuales por curl, invalidando el `gymId` de mi token a mitad
  de secuencia. Confirmado reproducible solo en esa ventana de carrera;
  con token fresco y sin resembrar en paralelo, todo funcionó normal.
  Nota para mí mismo: no correr suites E2E con `setup`/reseed al mismo
  tiempo que pruebas manuales sobre el mismo gym.

Datos de prueba limpiados al final (teléfono, pasarelas, biblioteca de
movimientos y colores de marca restaurados a sus valores originales).
