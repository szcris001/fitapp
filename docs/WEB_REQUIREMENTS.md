# FitHub — Documento de Requerimientos Web
**Panel de Administración · v1.5**
Última actualización: 2026-06-10

---

## 1. Descripción del producto

**FitHub** es una plataforma SaaS de gestión para centros deportivos (CrossFit, funcional, fitness). Permite administrar alumnos, clases, membresías, pagos y programación de entrenamientos desde un panel web, y ofrece a los alumnos una app móvil para reservar clases, ver el WOD del día y hacer seguimiento de su progreso físico.

El sistema es **multi-tenant**: cada gimnasio tiene su propio entorno aislado (alumnos, clases, planes, pagos). El superadmin de la plataforma gestiona los gimnasios desde un panel separado.

### Componentes del sistema

| Componente | Tecnología | URL de desarrollo |
|---|---|---|
| **API REST** | Fastify + Node.js + Prisma + PostgreSQL | `http://localhost:3001` |
| **Panel web admin** | Next.js 16 + Tailwind CSS + Zustand | `http://localhost:3000` |
| **App móvil** | React Native + Expo | (dispositivo físico o emulador) |

---

## 2. Roles de usuario

| Rol | Descripción | Acceso |
|---|---|---|
| `SUPER_ADMIN` | Operador de la plataforma FitHub | Solo panel superadmin (`/superadmin`) |
| `ADMIN` | Dueño o administrador del gimnasio | Panel completo |
| `COACH` | Entrenador del gimnasio | Panel limitado (ver alumnos, clases, WODs) |
| `MEMBER` | Alumno del gimnasio | Solo app móvil |

### Reglas de acceso del panel web

- `COACH` ve: Inicio, Alumnos, Clases, Pizarra (WODs) y Evolución. No ve: Planes, Pagos, Conciliación, Reportes, Comunicaciones, Configuración.
- `ADMIN` ve todo.
- `SUPER_ADMIN` es redirigido al panel `/superadmin` (distinto al dashboard de gym).

---

## 3. Autenticación

- **Login**: `POST /api/auth/login` → `{ token, refreshToken, user }`.
- **JWT**: adjunto en `Authorization: Bearer <token>` en cada request.
- **Refresh token**: `POST /api/auth/refresh` rota el token automáticamente. El interceptor Axios lo maneja transparentemente.
- **Logout**: `POST /api/auth/logout` revoca el refresh token.
- El token incluye `{ userId, gymId, role }`.

---

## 4. Módulos funcionales

### 4.1 Dashboard principal — `/dashboard`

**Estado: implementado**

Panel de inicio con indicadores clave del negocio.

**KPIs mostrados:**
- Total de alumnos activos
- Alumnos con membresía por vencer (próximos 7 días)
- Clases programadas hoy / esta semana
- Ingresos del mes
- Alumnos en riesgo de abandono (IA)

**Accesos rápidos:**
- Registrar pago manual (cobro en efectivo, tarjeta, transferencia)
- Registrar nueva asistencia
- Ver alertas de IA

**Pendiente / mejoras:**
- Indicador de días sin WOD programado
- Indicador de asistencia por horario
- Panel de evolución colectiva de alumnos

---

### 4.2 Alumnos — `/dashboard/users`

**Estado: implementado**

**Listado** (`/dashboard/users`):
- Tabla paginada con: nombre, email, plan activo, estado de membresía, fecha de vencimiento, última asistencia.
- Búsqueda por nombre / email.
- Filtro por estado (activo, vencido, trial, sin membresía).
- Botón "Nuevo alumno".

**Detalle de alumno** (`/dashboard/users/[id]`):
- Datos personales: nombre, email, teléfono, fecha de nacimiento, avatar.
- Membresía activa: plan, fechas, método de pago, estado, botón de renovar.
- Historial de pagos.
- Historial de asistencias.
- Historial de reservas (próximas y pasadas).
- Sección de RMs (marcas personales) por movimiento.
- Sección de progresión gimnástica por habilidad.
- Botón de asignar membresía.

**Crear alumno** (`/dashboard/users/new`):
- Formulario: nombre, email, contraseña, teléfono, fecha de nacimiento, rol.
- Asignación de plan opcional al momento de crear.

---

### 4.3 Clases — `/dashboard/classes`

**Estado: implementado**

**Listado** (`/dashboard/classes`):
- Calendario semanal o lista.
- Filtro por tipo de clase (CrossFit, Funcional, Weightlifting, etc.).
- Indicador de ocupación por clase (X/Y cupos).
- Enlace al detalle.
- Botón "Nueva clase".
- Importar clases desde Excel.

**Detalle de clase** (`/dashboard/classes/[id]`):
- Info: fecha, hora, duración, tipo, WOD asignado.
- Lista de inscritos con estado (confirmado, lista de espera, asistió, no asistió).
- Acción de marcar asistencia manual.
- Acción de escanear QR para asistencia.
- Acción de remover alumno de la clase.
- Asignar alumno directamente.

**Crear clase** (`/dashboard/classes/new`):
- Tipo de clase, fecha, hora inicio, duración, cupos, WOD asociado.

**Importar clases** (`/dashboard/classes/import`):
- Subir archivo Excel con columnas predefinidas.
- Preview de errores antes de confirmar la importación.

---

### 4.4 Tipos de clase — `/dashboard/settings/class-types`

**Estado: implementado**

- CRUD completo de tipos de clase (CrossFit, Funcional, Yoga, etc.).
- Cada tipo tiene: nombre, descripción, color de acento, duración por defecto, cupos por defecto, ícono.
- Importación desde Excel (`/dashboard/settings/class-types/import`).

---

### 4.5 WODs — `/dashboard/wods`

**Estado: implementado**

El WOD pertenece a un tipo de clase y a un día (día local del gym). **Se crea y edita en el detalle de la clase** (`/dashboard/classes/[id]`), que tiene el constructor de bloques; no hay un editor aparte (`/dashboard/wods/new` y `/dashboard/wods/[id]` redirigen a Clases).

**Listado** (`/dashboard/wods`, pestaña "WODs"):
- Fecha, tipo de clase, nombre, cantidad de bloques y movimientos.
- Filtros por rango de fechas (por defecto la semana actual) y tipo de clase.
- Cada WOD abre la clase de ese tipo en ese día.
- Botones "Nuevo WOD" (lleva al calendario de clases) e "Importar".
- Pestañas adicionales: Benchmarks y Récords (RM) del box; Modo TV.

**Editor (en el detalle de la clase)**:
- Bloques con nombre, timecap y movimientos con reps, cargas RX / escalado / rookie por género y % del RM.
- La carga recomendada por alumno se calcula en la app (`/wods/class/:classId/my-loads`).

**Importar WODs** (`/dashboard/wods/import`):
- Subir Excel con estructura de bloques y movimientos.

---

### 4.6 Planes y membresías — `/dashboard/plans`

**Estado: implementado**

- CRUD de planes: nombre, precio, máximo de clases por día, trial.
- **Toda membresía dura 30 días** (decisión de negocio 2026-06-13, confirmada 2026-09-27). No hay planes trimestrales/anuales: la duración no es configurable y la API guarda `durationDays = 30`.
- Pasarelas de pago habilitadas por plan.
- Listado de membresías activas y historial.
- Asignar membresía manualmente a un alumno.
- Ver estado de pagos: activo, vencido, trial, inactivo.

---

### 4.7 Pagos — `/dashboard/payments`

**Estado: implementado**

**Tabs:**
- **Pendientes**: comprobantes de transferencia bancaria esperando aprobación. Acciones: confirmar (con membresía asociada) o rechazar.
- **Historial**: todos los pagos del gym con método, monto, alumno, fecha.

**KPIs financieros:**
- Ingresos del mes actual.
- Ingresos del mes anterior.
- Total de membresías activas.

**Pasarelas de pago soportadas:**
- Efectivo, Transferencia bancaria (manual), Tarjeta (manual)
- Online: Stripe, Mercado Pago, Flow, Khipu, Kushki, PayU, OpenPay, MACH Business, Fintoc (Pay by Bank)

---

### 4.8 Conciliación bancaria — `/dashboard/fintoc`

**Estado: implementado**

Integración con Fintoc para conciliar movimientos bancarios contra pagos del gym.

- Conectar cuenta bancaria vía Fintoc Widget.
- Botón "Sincronizar" para importar movimientos nuevos.
- Tabla de movimientos con estado: Pendiente / Coincidencia encontrada / Confirmado / Rechazado.
- Matcher automático en 2 fases:
  - **Fase 1** (exact_rut): RUT + monto exacto → confirma automáticamente.
  - **Fase 2** (amount_only): solo monto ±72h → requiere revisión manual.
- Modal de confirmación: asociar movimiento a membresía del alumno.
- Modal de rechazo con motivo.

---

### 4.9 Reportes — `/dashboard/reports`

**Estado: parcialmente implementado**

- Reporte de ingresos por período.
- Reporte de asistencia por clase.
- Evolución de alumnos activos.

**Pendiente:** exportación a Excel/PDF, reportes de retención.

---

### 4.10 Comunicaciones — `/dashboard/communications`

**Estado: implementado**

- Envío de email masivo a alumnos del gym.
- Filtros: todos, activos, vencidos, por plan.
- Asunto y cuerpo del mensaje.
- Preview antes de enviar.

---

### 4.11 Alertas IA — `/dashboard/alerts`

**Estado: implementado**

Motor de retención basado en IA (Claude de Anthropic).

**Tipos de alertas:**
- Alumnos en riesgo de abandono (sin reservar en X días).
- Membresías por vencer (próximos 7 días).
- Alumnos inactivos.
- Insights generales del gym (tendencias de asistencia, ingresos, etc.).
- Proyección de objetivos por alumno (requiere historial de RMs).

---

### 4.12 Evolución de alumnos — `/dashboard/evolution`

**Estado: parcialmente implementado**

- Visualización de progreso colectivo e individual.
- Historial de RMs por movimiento.
- Progresión gimnástica por habilidad.

Visible en el menú para ADMIN y COACH.

**Pendiente:** completar gráficos de evolución individual.

---

### 4.13 Personal (Staff) — `/dashboard/staff`

**Estado: implementado**

- CRUD de coaches y administrativos.
- Asignación de rol (`ADMIN`, `COACH`).
- Ver clases asignadas.

---

### 4.14 Configuración del gimnasio — `/dashboard/settings`

**Estado: implementado**

Panel dividido en secciones colapsables:

**Información general:**
- Nombre, dirección, teléfono, email, redes sociales.
- Logo del gym (subir imagen).
- Horario de funcionamiento.

**Reservas:**
- Ventana de reserva anticipada (días).
- Minutos de corte para reservar.
- Minutos de corte para cancelar.

**Notificaciones:**
- Días de anticipación para aviso de vencimiento de membresía.

**Plantillas de correo** (`/dashboard/settings/email-templates`):
- Personalizar asunto y cuerpo de emails automáticos (bienvenida, vencimiento, confirmación de pago).

**Asistencia:**
- Modo: manual / automático (por horario) / QR / geolocalización.
- Si geolocalización: lat, lng y radio en metros.

**Lista de espera:**
- Habilitar confirmación manual de lista de espera.
- Minutos para confirmar antes de liberar el cupo.

**Pasarelas de pago:**
- Habilitar/deshabilitar cada pasarela.
- Configurar credenciales (API keys, secrets, webhooks) por pasarela.

**Cuenta bancaria (transferencias):**
- Nombre titular, RUT, banco, tipo de cuenta, número, email.

**DTE / Facturación (Bsale):**
- Integración con Bsale para emisión de boletas y facturas.
- Token, office ID, price list ID, tipos de documento.

**Terminología de clases** (integrado en Tipos de clase):
- Gestión de tipos de clase personalizados por gym.

**Biblioteca de movimientos** (`/dashboard/settings/movements`):
- Crear, editar y eliminar movimientos del gym.
- Categoría, nombre, descripción.
- Estos movimientos son la fuente de verdad para RMs y WODs.

**Branding / Tema** (`/dashboard/theme-preview`):
- Selector de tema deportivo (CrossFit, Boxeo, Yoga, etc.) con paleta de colores.
- Preview en tiempo real del tema en web y mobile.

**Habilidades gimnásticas** (en sección skills):
- CRUD de habilidades (Pull Up, Muscle Up, HSPU, etc.).
- Hitos de progresión por habilidad (hasta 5 hitos ordenados).

---

### 4.15 Panel Superadmin — `/superadmin`

**Estado: implementado** (acceso exclusivo para rol `SUPER_ADMIN`)

- Listado de todos los gyms de la plataforma.
- Crear gym nuevo con admin inicial.
- Ver detalle y editar configuración de cualquier gym.
- Cambiar estado de gym (activo / trial / suspendido).
- Gestión de suscripciones de gyms a la plataforma.
- Ver perfil del superadmin.

---

## 5. Pantallas por implementar / mejorar

| Pantalla | Prioridad | Descripción |
|---|---|---|
| Dashboard: indicador días sin WOD | Baja | Alerta visual cuando hay días próximos sin WOD programado |
| Dashboard: asistencia por horario | Baja | Heatmap de qué horarios tienen más asistencia |
| Reportes: exportar Excel/PDF | Media | Botón de descarga en páginas de reportes |
| Evolución: gráficos individuales | Media | Chart de evolución de RM por movimiento + skill progress |
| Conciliación Fintoc: mejoras UX | Baja | Filtros avanzados, exportar tabla |
| Superadmin: métricas plataforma | Baja | KPIs globales (gyms activos, MRR, etc.) |

---

## 6. Stack tecnológico web

| Capa | Tecnología |
|---|---|
| Framework | Next.js 16 (App Router) |
| Estilos | Tailwind CSS |
| Estado global | Zustand (persistido en `localStorage`) |
| HTTP client | Axios con interceptor JWT + auto-refresh |
| Iconos | Lucide React |
| Tablas Excel | `xlsx` (importación) |
| Autenticación | JWT con refresh token, almacenado en Zustand |

### Estructura de carpetas (`apps/web/`)
```
app/
├── login/                   # Pantalla de login
├── forgot-password/         # Recuperar contraseña
├── reset-password/          # Resetear contraseña con token
├── change-password/         # Cambiar contraseña (autenticado)
├── dashboard/
│   ├── layout.tsx           # Layout con sidebar y navbar
│   ├── page.tsx             # Dashboard principal
│   ├── users/               # Alumnos
│   ├── classes/             # Clases
│   ├── wods/                # WODs
│   ├── plans/               # Planes
│   ├── payments/            # Pagos
│   ├── fintoc/              # Conciliación bancaria
│   ├── reports/             # Reportes
│   ├── communications/      # Comunicaciones
│   ├── alerts/              # Alertas IA
│   ├── evolution/           # Evolución de alumnos
│   ├── staff/               # Personal
│   └── settings/            # Configuración del gym
└── superadmin/              # Panel superadmin (rol SUPER_ADMIN)
lib/
├── api.ts                   # Instancia Axios con interceptor
store/
├── auth.store.ts            # Estado de autenticación (Zustand)
```

---

## 7. API — Referencia de endpoints

Base URL: `http://localhost:3001/api` (dev) / `https://api.tudominio.com/api` (prod)

Todos los endpoints excepto `POST /auth/login` requieren `Authorization: Bearer <token>`.

### Autenticación
| Método | Ruta | Descripción |
|---|---|---|
| POST | `/auth/login` | Login, devuelve token + refreshToken |
| POST | `/auth/refresh` | Rotar access token con refreshToken |
| POST | `/auth/logout` | Revocar refresh token |

### Alumnos
| Método | Ruta | Descripción |
|---|---|---|
| GET | `/users` | Listar alumnos del gym |
| POST | `/users` | Crear alumno |
| GET | `/users/:id` | Detalle de alumno |
| PUT | `/users/:id` | Actualizar alumno |
| DELETE | `/users/:id` | Eliminar alumno |
| GET | `/users/me` | Perfil propio |
| PUT | `/auth/me` | Cambiar contraseña |

### Clases
| Método | Ruta | Descripción |
|---|---|---|
| GET | `/class-types` | Listar tipos de clase |
| POST | `/class-types` | Crear tipo de clase |
| PUT | `/class-types/:id` | Actualizar tipo de clase |
| DELETE | `/class-types/:id` | Eliminar tipo de clase |
| GET | `/classes` | Listar clases (`?from=&to=`) |
| POST | `/classes` | Crear clase |
| GET | `/classes/:id` | Detalle de clase con inscritos |
| DELETE | `/classes/:id` | Eliminar clase |
| POST | `/classes/:id/attendance/:userId` | Marcar asistencia manual |
| POST | `/bookings/:id/confirm` | Confirmar reserva (waitlist) |
| DELETE | `/bookings/:bookingId/admin` | Remover alumno de clase |

### WODs
| Método | Ruta | Descripción |
|---|---|---|
| GET | `/wods` | Listar WODs (`?from=&to=&classTypeId=`) |
| POST | `/wods` | Crear WOD con bloques y movimientos (Zod; uno por tipo de clase y día) |
| PUT | `/wods/:id` | Actualizar WOD (reemplaza bloques en una transacción) |
| DELETE | `/wods/:id` | Eliminar WOD |
| POST | `/wods/import` | Importación masiva desde Excel (JSON validado con Zod; duplicados se reportan en `errors`) |
| GET | `/wods/class/:classId` | WOD del día de una clase |
| GET | `/wods/class/:classId/my-loads` | Cargas personalizadas del alumno |
| GET | `/wods/:id/leaderboard` | Leaderboard del WOD |
| POST | `/wods/:id/results` | Coach registra resultado de un alumno |
| GET | `/benchmarks` | Listar benchmarks (Girls, Heroes, Open, Games y propios del gym) |

### Planes y membresías
| Método | Ruta | Descripción |
|---|---|---|
| GET | `/plans` | Listar planes del gym |
| POST | `/plans` | Crear plan (`priceCents` en unidad mínima ISO 4217; CLP = pesos) |
| PUT | `/plans/:id` | Actualizar plan |
| DELETE | `/plans/:id` | Eliminar plan |
| POST | `/memberships` | Asignar membresía a un alumno (30 días) |
| PATCH | `/memberships/:id` | Editar membresía |
| POST | `/memberships/:userId/renew` | Renovar membresía |
| GET | `/payments/my-memberships` | Membresías del alumno autenticado |

### Pagos
| Método | Ruta | Descripción |
|---|---|---|
| GET | `/payments/revenue` | KPIs financieros del gym |
| GET | `/payments/history` | Historial de pagos |
| POST | `/payments/transfer/receipt` | Alumno sube comprobante de transferencia |
| GET | `/payments/transfer/pending` | Comprobantes pendientes de aprobación |
| PATCH | `/payments/transfer/:membershipId/confirm` | Confirmar transferencia |
| PATCH | `/payments/transfer/:membershipId/reject` | Rechazar transferencia (`{ reason }`) |
| POST | `/payments/manual` | Registrar pago manual (efectivo/tarjeta) |
| GET | `/payments/gateways` | Ver config de pasarelas del gym (se edita vía `PUT /gyms/me`) |

### Configuración del gym
| Método | Ruta | Descripción |
|---|---|---|
| GET | `/gyms/me` | Config completa del gym |
| PUT | `/gyms/me` | Actualizar config del gym (incluye pasarelas y plantillas de correo) |
| POST | `/gyms/me/logo` | Subir logo |
| GET | `/skills` | Listar habilidades gimnásticas del gym |
| POST | `/skills` | Crear habilidad |
| PUT | `/skills/:id` | Actualizar habilidad |
| DELETE | `/skills/:id` | Eliminar habilidad |

### Analytics e IA
| Método | Ruta | Descripción |
|---|---|---|
| GET | `/ai/retention-alerts` | Alertas de retención (IA) |
| GET | `/ai/insights` | Insights generales del gym (IA) |
| GET | `/ai/athlete-projection/:userId` | Proyección de objetivos (IA) |
| GET | `/analytics/gym-stats` | Estadísticas del gym (ADMIN y COACH) |
| GET | `/rms/gym-evolution` | Evolución colectiva de RMs (ADMIN y COACH) |
| GET | `/rms/user/:userId` | RMs de un alumno |
| GET | `/gymnastic-progress/user/:userId` | Progresión gimnástica de un alumno |

### Comunicaciones
| Método | Ruta | Descripción |
|---|---|---|
| POST | `/messages/email` | Email a alumnos (`target`: `all`, `active`, `expiring`, `inactive`, `individual` + `userId`, `plan` + `planId`) |
| POST | `/messages/push` | Push a alumnos (mismos `target`) |
| POST | `/gyms/me/email-blast` | Envío masivo con plantilla |
| POST | `/gyms/me/email-test` | Correo de prueba (SMTP del gym) |

### Fintoc (conciliación bancaria)
| Método | Ruta | Descripción |
|---|---|---|
| POST | `/payments/fintoc/link-intent` | Crear link intent → `widget_token` para el widget de Fintoc |
| POST | `/payments/fintoc/link/exchange` | Canjear `exchange_token` del widget y guardar el link |
| POST | `/payments/fintoc/link` | Guardar un link existente manualmente (alternativa al widget) |
| GET | `/payments/fintoc/status` | Estado de la conexión Fintoc |
| POST | `/payments/fintoc/sync` | Sincronizar movimientos entrantes desde la API de Fintoc |
| GET | `/payments/fintoc/movements` | Listar movimientos (`?status=&page=`) |
| PATCH | `/payments/fintoc/movements/:movementId/confirm` | Confirmar movimiento |
| PATCH | `/payments/fintoc/movements/:movementId/reject` | Rechazar movimiento |

---

## 8. Modelo de datos clave

```
Gym
 ├── Users (alumnos, coaches, admin)
 ├── Plans
 │    └── Memberships (historial de membresías de cada alumno)
 ├── ClassTypes (tipos de clase)
 ├── Classes (instancias de clase programadas)
 │    └── Bookings (reservas de alumnos)
 ├── Wods (WODs del día)
 │    └── WodBlocks → WodMovements
 ├── RmRecords (marcas personales por movimiento)
 ├── GymSkills → GymSkillMilestones (habilidades gimnásticas)
 ├── GymnasticProgress (historial de hitos logrados)
 ├── Payments (historial de pagos)
 ├── FintocLink + BankMovements (conciliación)
 └── Notifications
```

---

## 9. Variables de entorno necesarias

**`apps/web/.env.local`**
```env
NEXT_PUBLIC_API_URL=http://localhost:3001/api
```

**`apps/api/.env`**
```env
DATABASE_URL="postgresql://fitapp:fitapp123@localhost:5432/fitapp_dev"
JWT_SECRET="tu_secret_aqui"
PORT=3001
ANTHROPIC_API_KEY="sk-ant-..."         # Para funciones de IA
STRIPE_SECRET_KEY="sk_test_..."        # Pasarela Stripe (opcional)
FRONTEND_URL="http://localhost:3000"
SMTP_HOST="smtp.gmail.com"             # Para emails automáticos
SMTP_PORT=587
SMTP_USER="..."
SMTP_PASS="..."
```

---

## 10. Cómo correr el proyecto en desarrollo

```bash
# Requisitos: Node 20, pnpm 9, Docker

# 1. Levantar base de datos y Redis
docker-compose up -d

# 2. Instalar dependencias
pnpm install

# 3. Ejecutar migraciones y seed inicial
cd apps/api
pnpm prisma migrate dev
pnpm prisma db seed

# 4. Correr todos los servicios
cd ../..
pnpm dev
# → API en http://localhost:3001
# → Web en http://localhost:3000
```

---

## 11. Notas para el equipo de desarrollo

1. **Multi-tenancy**: cada request autenticado lleva `gymId` en el JWT. Nunca confiar en un `gymId` del body — siempre usar el del token.

2. **Pasarelas de pago**: la configuración de cada pasarela (keys, secrets) se guarda en el campo `paymentGateways` (JSON) del modelo `Gym`. Nunca hardcodear credenciales.

3. **Branding dinámico**: cada gym puede tener su propio tema visual (`sportTheme`). La web y el mobile lo cargan desde `GET /gyms/me` al iniciar sesión.

4. **Refresh token**: el interceptor de Axios (`lib/api.ts`) maneja la rotación automáticamente. No hay que gestionar la expiración manualmente en los componentes.

5. **Subida de archivos**: algunos endpoints usan `multipart/form-data` (avatar de usuario, logo del gym, comprobantes de transferencia). El cliente Axios tiene configuración especial para estos casos.

6. **WODs y estructura de bloques**: un WOD tiene N bloques, cada bloque tiene N movimientos. La estructura es `wod.blocks[].movements` — no existe `wod.movements` directamente.

7. **Zona horaria**: el servidor corre en UTC. Las clases se almacenan en UTC. El campo `timezone` del gym (ej: `America/Santiago`) se usa para calcular correctamente los límites de día al validar reservas.
