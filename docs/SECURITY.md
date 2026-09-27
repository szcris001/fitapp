# SECURITY.md — Controles de Seguridad FitApp

Fecha de implementación: 2026-06-15

---

## Resumen

Checklist pre-deploy ejecutado en sesión 2026-06-15. Se aplicaron 7 controles sobre la API y el frontend web. La superficie de ataque fue reducida a niveles aceptables para un SaaS B2B.

---

## Controles aplicados

### 1. JWT_SECRET obligatorio (`apps/api/src/index.ts`)

**Problema**: la API arrancaba con un string hardcodeado si `JWT_SECRET` no estaba configurado.

**Fix**: guard al inicio del proceso que hace `process.exit(1)` si la variable no está definida.

```ts
if (!process.env.JWT_SECRET) {
  console.error('FATAL: JWT_SECRET no configurado...')
  process.exit(1)
}
```

**JWT_SECRET generado para producción** (no commitear en ningún archivo):
```
cb2f24e2fdd333db1fd4a0b4515ce961299e30a7f4e35960ad4899730a3ef5a9
```
Configurar en Railway → API Service → Variables.

---

### 2. Cabeceras HTTP de seguridad — API (`apps/api/src/index.ts`)

Se instaló `@fastify/helmet` con HSTS habilitado:

```ts
app.register(helmet, {
  contentSecurityPolicy: false,    // CSP lo gestiona Next.js en el frontend
  crossOriginEmbedderPolicy: false,
  hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
})
```

Cabeceras resultantes en cada respuesta de la API:
- `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload`
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: SAMEORIGIN`
- `X-DNS-Prefetch-Control: on`

---

### 3. Cabeceras HTTP de seguridad — Web (`apps/web/next.config.ts`)

Cabeceras configuradas en `async headers()` para todas las rutas `/(.*)`':

| Cabecera | Valor |
|---|---|
| `X-Content-Type-Options` | `nosniff` |
| `X-Frame-Options` | `SAMEORIGIN` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=(self)` |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains; preload` |
| `Content-Security-Policy` | ver detalle abajo |

**CSP configurada**:
```
default-src 'self';
style-src 'self' 'unsafe-inline';
script-src 'self' 'unsafe-inline' 'unsafe-eval';
img-src 'self' data: blob: https://images.unsplash.com;
font-src 'self';
connect-src 'self' <NEXT_PUBLIC_API_URL sin /api>;
frame-ancestors 'none'
```

`unsafe-inline` y `unsafe-eval` en scripts son necesarios para Next.js App Router en producción. La CSP se puede reforzar con nonces si se configura un middleware de Next.js (tarea futura).

---

### 4. CORS restrictivo (`apps/api/src/index.ts`)

**Problema**: `origin: true` aceptaba requests de cualquier dominio — cualquier sitio web podía hacer llamadas autenticadas a la API usando cookies del usuario.

**Fix**: función de validación de origen con lógica diferenciada por ambiente:

```ts
origin: (origin, callback) => {
  // Sin origin = app móvil nativa → siempre permitir
  if (!origin) return callback(null, true)

  // Dev: cualquier localhost
  if (process.env.NODE_ENV !== 'production') {
    if (/^https?:\/\/localhost(:\d+)?$/.test(origin)) return callback(null, true)
  }

  // Prod: solo FRONTEND_URL exacto
  if (frontendUrl && origin === frontendUrl) return callback(null, true)

  callback(new Error(`CORS: origen no permitido — ${origin}`), false)
}
```

**Requisito**: configurar `FRONTEND_URL=https://tudominio.com` en Railway → API Service → Variables.

---

### 5. Rate limiting (`apps/api/src/index.ts` + `apps/api/src/modules/auth/auth.routes.ts`)

**Rate limit global** (todas las rutas): 120 req/minuto por IP.

**Rate limit estricto** (rutas de auth): 10 req/15 minutos por IP.

Rutas con rate limit estricto:
- `POST /auth/login`
- `POST /auth/forgot-password`
- `POST /auth/reset-password`

```ts
// En auth.routes.ts
const authRateLimit = {
  config: { rateLimit: { max: 10, timeWindow: '15 minutes' } },
}
app.post('/auth/login', { ...authRateLimit }, handler)
```

---

### 6. Error handler seguro (`apps/api/src/index.ts`)

**Problema**: los stack traces de errores internos se exponían en las respuestas de producción.

**Fix**: handler que oculta detalles de errores 5xx en producción:

```ts
app.setErrorHandler((error: Error & { statusCode?: number }, _request, reply) => {
  const isProd = process.env.NODE_ENV === 'production'
  const status = error.statusCode ?? 500
  app.log.error({ err: error, status }, error.message)
  reply.status(status).send({
    statusCode: status,
    error: isProd && status >= 500 ? 'Error interno del servidor' : error.message,
    ...(isProd ? {} : { stack: error.stack }),
  })
})
```

En producción, errores 500 devuelven `"Error interno del servidor"` — sin revelar rutas, versiones o lógica interna. Los logs detallados van a la consola/Sentry.

---

### 7. Row Level Security (RLS) en PostgreSQL

**Objetivo**: aislamiento a nivel de base de datos — si un service olvida filtrar por `gymId`, un request autenticado igual no puede leer ni escribir datos de otro gym.

**Migración**: `apps/api/prisma/migrations/20260927010000_rls_enforced/migration.sql` (reemplaza `20260616000000_enable_rls` y `20260625000000_rls_missing_tables`, que nunca protegieron nada: la app corría como superusuario y las policies tenían `OR pg_has_role(current_user, 'fitapp_superadmin')`, rol otorgado al propio usuario de la app).

**Rol de la app**: `fitapp_app` — `NOSUPERUSER NOBYPASSRLS`, solo `SELECT/INSERT/UPDATE/DELETE`. La app se conecta con él (`DATABASE_URL`); el usuario admin (`DATABASE_ADMIN_URL`) solo corre migraciones, seeds y `scripts/setup-app-db-role`. En Docker, la API arranca sin las credenciales de admin en su entorno.

**Tablas protegidas** (25):
- Con `gymId` propio: `User`, `Plan`, `ClassType`, `Class`, `Wod`, `GymSkill`, `GymSubscription`, `GymSubscriptionPayment`, `BenchmarkResult`, `FintocLink`, `BankMovement`, `WodResult`, `FintocPaymentIntent`, `Benchmark` (los oficiales, `gymId NULL`, visibles para todos).
- Hijas (visibles si su padre lo es): `Membership`, `RmRecord`, `GymnasticProgress`, `RefreshToken`, `PasswordResetToken` (→ `User`), `Booking` (→ `Class`), `ClassTypeBlock` (→ `ClassType`), `WodBlock` (→ `Wod`), `WodMovement` (→ `WodBlock`), `GymSkillMilestone` (→ `GymSkill`), `BenchmarkMovement` (→ `Benchmark`).
- Globales, sin RLS: `Gym`, `PlatformSettings`, `PlatformAsset`, `EmailTemplate`, `FitAppPlan`.

**Policy** (ejemplo): `USING/WITH CHECK (app_rls_bypass() OR "gymId" = current_gym_id())`. En `User` además `OR "id" = current_app_user_id()` (el admin ve su propia fila tras `switch-sede`).

**Cómo llega el contexto** (`lib/tenant-hook.ts` → `lib/tenant-context.ts` → `lib/prisma.ts`):
1. `onRequest` abre un contexto de sistema (AsyncLocalStorage); si el JWT es válido y trae `gymId`, `preHandler` lo restringe a ese gym/usuario.
2. `TenantAwarePool` (subclase de `pg.Pool`) fija `app.current_gym_id`, `app.current_user_id` y `app.bypass_rls` en cada conexión que entrega. Todas las queries de Prisma —sueltas y transacciones— pasan por ahí, así que una conexión reciclada nunca conserva el gym de otro request.
3. `findUnique` se ejecuta como `findFirst` fuera de transacciones: el dataloader de Prisma agrupa `findUnique` del mismo tick aunque sean de requests distintos.

**Bypass (código de sistema)**: sin contexto — cron, webhooks y callbacks de pago, login/refresh, seeds al arrancar — o SUPER_ADMIN sin gym. Una conexión como `fitapp_app` sin variables (p. ej. `psql`) no ve ninguna fila.

**Tests**: `src/lib/__tests__/rls.integration.test.ts`. `src/test/tenant-setup.ts` registra el contexto en todo Fastify de los tests, así la suite completa corre bajo RLS cuando `DATABASE_URL` usa `fitapp_app` (también en CI).

**RLS es defensa en profundidad**: el filtro `gymId` explícito en cada query sigue siendo obligatorio (CLAUDE.md).

---

### 8. Actualización de dependencias vulnerables

**`@fastify/jwt`** actualizado de `10.0.0` a `10.1.0`:
- 3 CVEs críticos en `fast-jwt` resueltos por la actualización

**`react-native → shell-quote`** (CVE pendiente):
- Cadena: `react-native → react-devtools-core → shell-quote`
- **Decisión**: aceptar. `shell-quote` solo se usa en herramientas de desarrollo de React Native — no se incluye en el bundle de producción de la app nativa. No es explotable por usuarios finales.

---

## Controles adicionales aplicados (2026-06-18)

### 9. Lockout de cuenta por email — `apps/api/src/modules/auth/auth.service.ts`

**Problema**: el rate limiting por IP (10 req/15min) puede bypassearse rotando IPs desde una botnet. Un atacante podía intentar contraseñas indefinidamente contra el mismo email.

**Fix**: bloqueo progresivo **por email** independiente de la IP.

- Tras 5 intentos fallidos: bloqueo de 15 minutos
- El bloqueo usa la clave `gymSlug:email` → aislado por box
- Login exitoso limpia el contador inmediatamente
- El mensaje de error dice cuántos minutos restan ("Cuenta bloqueada temporalmente. Intenta en 8 minutos.")
- Implementación in-memory (`Map`) — válida para instancia única. Para múltiples instancias (scale horizontal) se debe migrar a Redis con `INCR` + `EXPIRE`.
- bcrypt se ejecuta incluso si el usuario no existe (evita timing attack que revela emails existentes)

### 10. Validación de MIME type en uploads — `apps/api/src/modules/users/users.routes.ts`

**Problema**: el avatar solo validaba `path.extname(data.filename)` — un atacante podía renombrar un archivo `.svg` (XSS) o `.html` como `foto.jpg` y servirlo con Content-Type incorrecto.

**Fix**: whitelist estricta de MIME types aceptados:
```ts
const ALLOWED_MIME: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png':  '.png',
  'image/webp': '.webp',
}
```
- La extensión del archivo en disco se deriva del MIME type, nunca del nombre original
- Si el MIME no está en la whitelist → 400 inmediato, se drena el stream (`data.file.resume()`)

### 11. Auditoría de dependencias en CI — `.github/workflows/ci.yml`

**Problema**: CVEs nuevos en dependencias no se detectaban hasta que alguien corría `pnpm audit` manualmente.

**Fix**: nuevo job `security-audit` que corre en cada push y PR:
```yaml
- name: Audit dependencies
  run: pnpm audit --audit-level=high
```
Bloquea el CI si hay vulnerabilidades High o Critical sin parchear.

### 12. Mensaje genérico en endpoint refresh — `apps/api/src/modules/auth/auth.routes.ts`

**Fix menor**: cambiado `"Usuario no encontrado"` → `"Sesión inválida"` en el endpoint `/auth/refresh` para no revelar que el userId embebido en el token ya no existe en la base de datos.

---

## Pendientes de seguridad

### ~~P1 — Middleware RLS en Fastify~~ — resuelto (2026-09-27)

Ver sección 7: RLS aplicado con rol `fitapp_app`, contexto por conexión y tests bajo RLS.

### P2 — CSP con nonces (mejora futura)

Reemplazar `'unsafe-inline'` en `script-src` con nonces generados por middleware de Next.js. Requiere configurar `middleware.ts` en el proyecto web. Mejora la protección XSS.

### P3 — Refresh token rotation en mobile

La app mobile aún no implementa rotación de refresh tokens — hace logout al expirar el access token. Es funcional pero subóptimo en UX. Ver implementación en web (`apps/web/lib/api.ts`).

---

## Variables de entorno de seguridad críticas

| Variable | Dónde | Descripción |
|---|---|---|
| `JWT_SECRET` | Railway → API | Mínimo 32 bytes hex aleatorios. Cambiar implica invalidar todos los tokens activos. |
| `DATABASE_URL` | Railway → API | Acceso completo a la base de datos. Nunca exponer en logs. |
| `FRONTEND_URL` | Railway → API | URL exacta del frontend (ej: `https://app.tudominio.com`). CORS rechaza el resto. |
| `STRIPE_SECRET_KEY` (live) | Railway → API | Puede generar cargos reales. Usar `sk_live_...`, nunca `sk_test_...` en prod. |
| `ANTHROPIC_API_KEY` | Railway → API | Costo por token. Monitorear uso en console.anthropic.com. |

**Nunca commitear estas variables** en ningún archivo del repositorio. Configurar exclusivamente en el dashboard de Railway.

---

## Archivos nuevos creados en esta sesión

| Archivo | Descripción |
|---|---|
| `apps/api/Dockerfile` | Multi-stage build para la API (deps → builder → runner) |
| `apps/web/Dockerfile` | Multi-stage build para Next.js standalone |
| `apps/api/.dockerignore` | Excluye node_modules, dist, .env, tests |
| `apps/web/.dockerignore` | Excluye node_modules, .next, .env |
| `apps/api/.env.example` | Plantilla con 25 variables de entorno documentadas |
| `apps/web/.env.example` | Plantilla con NEXT_PUBLIC_API_URL |
| `apps/api/prisma/migrations/20260927010000_rls_enforced/migration.sql` | RLS en PostgreSQL + rol `fitapp_app` |
| `.claude/agents/security.md` | Agente de seguridad para auditorías futuras |

---

## Cumplimiento Google Play / App Store (2026-06-18)

### Cambios en código aplicados

**`apps/mobile/app.json`**:
- `NSCameraUsageDescription` corregida: describe QR + foto de perfil (antes decía solo "fotos de logros")
- `NSLocationWhenInUseUsageDescription` agregada (era obligatoria — ClassesScreen la usa pero no estaba declarada → crash en iOS)
- `NSMicrophoneUsageDescription` eliminada (la app no usa el micrófono; Apple rechaza permisos sin uso real)
- `android.permissions` agregado explícitamente: CAMERA, READ_MEDIA_IMAGES, ACCESS_FINE_LOCATION, ACCESS_COARSE_LOCATION, VIBRATE, POST_NOTIFICATIONS
- Plugins añadidos: `expo-camera`, `expo-location`, `expo-notifications` (estaban en uso pero no declarados)

**`apps/api/src/modules/users/users.routes.ts`** — endpoint nuevo:
- `DELETE /users/me` (preHandler: authenticate) — elimina en transacción: bookings, rmRecords, gymnasticProgress, wodResults, refreshTokens, memberships, user. Retorna `{ ok: true }`.
- Obligatorio por Google Play (política de eliminación de cuentas vigente desde mayo 2024)

**`apps/mobile/src/screens/ProfileScreen.tsx`**:
- Sección "Legal" con dos filas: Política de Privacidad y Términos de Servicio. Cada una muestra un Alert con la URL y descripción básica. Las URLs deben actualizarse al dominio real cuando esté disponible.
- Botón "Eliminar mi cuenta" (discreto, opacidad reducida) que abre un BottomSheet de confirmación con descripción de consecuencias + botón rojo confirmador + spinner durante la operación + logout automático al confirmar.

### Lo que debe hacer Cristian manualmente (no es código)

1. **Publicar Política de Privacidad** — crear una página web accesible públicamente con:
   - Qué datos se recopilan: nombre, email, teléfono, RUT, membresías, pagos, récords de entrenamiento, foto de perfil, push token, ubicación (si la conceden), datos del dispositivo
   - Para qué se usan: operar el servicio, enviar notificaciones, procesar pagos
   - Con quién se comparten: Stripe / Mercado Pago / Flow (procesadores de pago), Expo (push notifications), Anthropic (análisis IA — datos anonimizados)
   - Cómo eliminar la cuenta: desde la app → Perfil → Eliminar mi cuenta
   - Contacto: email para solicitudes de datos

2. **Publicar Términos de Servicio** — documento con condiciones de uso, limitaciones de responsabilidad, política de reembolsos.

3. **Actualizar URLs en ProfileScreen** — reemplazar `https://fitapp.tudominio.com/privacy` y `/terms` con las URLs reales una vez publicadas.

4. **Google Play Console → Data Safety**:
   - Datos recopilados: Información de contacto (email, teléfono), Información financiera (historial de pagos), Actividad de la app (reservas, asistencia), Salud y ejercicio (récords de levantamiento, habilidades gimnásticas), Identidad (nombre, foto), Ubicación aproximada
   - Todos los datos vinculados al usuario
   - Usuarios pueden solicitar eliminación: Sí (vía app o email)
   - Añadir "Delete Account URL": `https://fitapp.tudominio.com/delete-account` o email de soporte

5. **App Store Connect → App Privacy**:
   - Mismas categorías que Data Safety
   - Marcar "Data Used to Track You": No (la app no usa datos para publicidad)
   - Health & Fitness: datos de entrenamiento usados para funcionalidad, vinculados al usuario
