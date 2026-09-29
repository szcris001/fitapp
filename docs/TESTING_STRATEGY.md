# Estrategia de pruebas — FitApp

Cómo se prueba FitApp de punta a punta. Complementa a `docs/PLAN_DE_PRUEBAS.md`, que cubre
las zonas de riesgo del backend (carga personalizada, multi-tenancy, pasarelas, Fintoc,
auto-renovación, Excel y benchmarks) con tests Vitest.

## 1. Capas

| Capa | Qué es | Dónde | Cuándo corre | Qué atrapa |
|---|---|---|---|---|
| 0. API | Vitest con Postgres real bajo RLS | `apps/api/src/**/__tests__` | Cada PR (CI) | Lógica, permisos y aislamiento |
| 1. E2E web | Playwright por módulo y rol | `apps/web/e2e/modules` | Cada PR (CI) y a pedido | Regresiones en flujos conocidos |
| 2. Exploratoria | Agentes `qa-explorer` que usan un navegador real (Playwright MCP) | `qa/charters` → `qa/reports` | Antes de cada release o a pedido | Lo que nadie pensó en testear |
| 3. Manual | Lo que no se puede automatizar | §6 | Antes del deploy | Pasarelas reales, teléfono y producción |

Regla: **cada hallazgo confirmado de la capa 2 se convierte en un test de la capa 0 o de la
capa 1**, en el mismo PR que lo corrige.

## 2. Entorno QA

- Datos: `cd apps/api && pnpm seed:qa`. Borra y recrea los gyms `qa-*` de `qa/fixtures.json`.
  Se puede correr cuantas veces se quiera y se niega a correr con `NODE_ENV=production`.
- Usuarios (contraseña común en `qa/fixtures.json`):

| Gym | Rol | Email | Para qué |
|---|---|---|---|
| qa-box-norte | ADMIN | admin@qa-norte.test | Recorrido completo |
| qa-box-norte | COACH | coach@qa-norte.test | Permisos de coach |
| qa-box-norte | MEMBER | member@qa-norte.test | Alumna con plan activo, RMs, asistencia y reserva mañana |
| qa-box-norte | MEMBER | riesgo@qa-norte.test | En riesgo: sin reservas en 20 días, vence en 2 días |
| qa-box-norte | MEMBER | transfer@qa-norte.test | Transferencia pendiente para confirmar en Pagos |
| qa-box-norte | MEMBER | rechazo@qa-norte.test | Transferencia pendiente para rechazar en Pagos |
| qa-box-norte | MEMBER | fintoc@qa-norte.test | Transferencia pendiente que calza con un movimiento bancario (RUT 44.444.444-4) |
| qa-box-sur | ADMIN / MEMBER | admin@qa-sur.test / member@qa-sur.test | Aislamiento entre gyms |
| — | SUPER_ADMIN | superadmin@qa.test | Panel superadmin (login sin slug) |

- Escenario sembrado en qa-box-norte:
  - Clases de CrossFit de −7 a +3 días a las 07:00, 19:00 y 21:00 hora local, y Halterofilia los días pares a las 18:00.
  - WOD de CrossFit ayer, hoy (puntaje TIME) y mañana. Halterofilia no tiene WOD.
  - Planes «QA Mensual» ($35.000) e «QA Ilimitado» ($49.990).
  - Link Fintoc de prueba con dos movimientos: uno calzado por RUT y otro sin identificar.
- Servidores: API en :3001 (`pnpm dev` en `apps/api`) y web en :3000.
- Si una capa modifica datos, el siguiente recorrido parte con `pnpm seed:qa`.

## 3. Severidad de hallazgos

| Nivel | Criterio | Ejemplo |
|---|---|---|
| S1 Crítico | Seguridad, datos de otro gym, cobros incorrectos o pérdida de datos | Admin de Sur ve alumnos de Norte; plan de $35.000 cobra $350 |
| S2 Alto | Flujo principal roto sin alternativa | No se puede crear un WOD |
| S3 Medio | Flujo con error pero con alternativa, o dato mal mostrado | Fecha en UTC en vez de hora local |
| S4 Bajo | Cosmético, textos o usabilidad | Botón desalineado o typo |

## 4. Matriz de casos

Prioridad: **P0** bloquea release, **P1** importante, **P2** deseable.
Capa: **E2E** (capa 1), **EXP** (capa 2, la ficha la cubre explícitamente), **MAN** (manual).
Los IDs se referencian en los tests (`test('AUTH-01 …')`), en las fichas y en los informes.

### AUTH — Login y sesión
| ID | Caso | Rol | P | Capa |
|---|---|---|---|---|
| AUTH-01 | Login correcto con slug → `/dashboard` | ADMIN | P0 | E2E |
| AUTH-02 | Contraseña incorrecta → mensaje de error, sin sesión | — | P0 | E2E |
| AUTH-03 | Email de un gym con el slug de otro → rechazado | — | P0 | E2E |
| AUTH-04 | Superadmin sin slug → `/superadmin` | SUPER_ADMIN | P0 | E2E |
| AUTH-05 | Sin sesión, ir a `/dashboard/users` → redirige a login | — | P0 | E2E |
| AUTH-06 | Logout limpia la sesión; volver atrás no muestra datos | ADMIN | P1 | E2E |
| AUTH-07 | MEMBER intenta entrar a la web admin → no accede al panel | MEMBER | P0 | E2E |
| AUTH-08 | Olvidé mi contraseña: el flujo no revela si el email existe | — | P2 | EXP |

### NAV — Menú y permisos por rol
| ID | Caso | Rol | P | Capa |
|---|---|---|---|---|
| NAV-01 | ADMIN ve todo el menú, incluidos Pagos y Evolución | ADMIN | P0 | E2E |
| NAV-02 | COACH ve solo Inicio, Alumnos, Clases, Pizarra y Evolución | COACH | P0 | E2E |
| NAV-03 | COACH escribe la URL de Pagos, Planes, Configuración, Fintoc o Reportes → redirige | COACH | P0 | E2E |
| NAV-04 | Todas las páginas del menú cargan sin error de consola ni 5xx | ADMIN | P1 | E2E |

### DASH — Inicio
| ID | Caso | Rol | P | Capa |
|---|---|---|---|---|
| DASH-01 | KPIs de ingresos del mes y alumnos en riesgo con valores del seed | ADMIN | P1 | E2E |
| DASH-02 | Tarjeta «WOD del día» muestra «QA WOD Hoy» | ADMIN | P1 | E2E |
| DASH-03 | Ocupación y horario destacado se calculan sin error | ADMIN | P2 | EXP |

### USR — Alumnos y personal
| ID | Caso | Rol | P | Capa |
|---|---|---|---|---|
| USR-01 | Lista muestra los 3 alumnos de Norte y ninguno de Sur | ADMIN | P0 | E2E |
| USR-02 | Crear alumno → aparece en la lista | ADMIN | P0 | E2E |
| USR-03 | Email duplicado en el mismo gym → error claro | ADMIN | P1 | E2E |
| USR-04 | Detalle del alumno: membresía, RMs y asistencia del seed | ADMIN | P1 | E2E |
| USR-05 | Avatar: subir y ver; la URL sin token responde 401 | ADMIN | P0 | E2E |
| USR-06 | Asignar y renovar membresía → 30 días | ADMIN | P0 | E2E |
| USR-07 | Personal: crear coach y cambiar rol | ADMIN | P1 | EXP |
| USR-08 | COACH ve alumnos pero no puede borrarlos ni cambiar roles | COACH | P1 | EXP |

### PLN — Planes
| ID | Caso | Rol | P | Capa |
|---|---|---|---|---|
| PLN-01 | Crear plan de $35.000 CLP → se muestra $35.000 al recargar | ADMIN | P0 | E2E |
| PLN-02 | Editar plan sin tocar el precio → el precio no cambia | ADMIN | P0 | E2E |
| PLN-03 | Plan trial (gratis) | ADMIN | P1 | E2E |
| PLN-04 | Precio inválido (negativo, texto o decimales en CLP) → validación | ADMIN | P1 | EXP |

### CLS — Clases y tipos de clase
| ID | Caso | Rol | P | Capa |
|---|---|---|---|---|
| CLS-01 | Calendario de hoy muestra las clases de 07:00, 18:00, 19:00 y 21:00 en hora local | ADMIN | P0 | E2E |
| CLS-02 | Crear clase única y recurrente | ADMIN | P0 | E2E |
| CLS-03 | Detalle de clase: editar WOD con puntaje TIME → persiste | ADMIN | P0 | E2E |
| CLS-04 | Marcar y desmarcar asistencia | COACH | P0 | E2E |
| CLS-05 | Tipos de clase: crear, editar e importar desde Excel | ADMIN | P1 | E2E |
| CLS-06 | Importar clases desde Excel | ADMIN | P1 | EXP |

### WOD — Pizarra
| ID | Caso | Rol | P | Capa |
|---|---|---|---|---|
| WOD-01 | Listado con filtros de fecha y tipo de clase | COACH | P0 | E2E |
| WOD-02 | Importar Excel de plantilla → crea WODs | ADMIN | P0 | E2E |
| WOD-03 | Reimportar el mismo archivo → 0 creados y aviso de duplicado | ADMIN | P0 | E2E |
| WOD-04 | Leaderboard: registrar resultado de un alumno y verlo ordenado | COACH | P1 | E2E |
| WOD-05 | Modo TV se ve a pantalla completa y sin controles de edición | COACH | P2 | EXP |

### PAY — Pagos
| ID | Caso | Rol | P | Capa |
|---|---|---|---|---|
| PAY-01 | Transferencias pendientes (Tomás, Rita y Fernanda) visibles con comprobante | ADMIN | P0 | E2E |
| PAY-02 | Confirmar transferencia → membresía activa y desaparece de pendientes | ADMIN | P0 | E2E |
| PAY-03 | Rechazar la transferencia de Rita con motivo | ADMIN | P0 | E2E |
| PAY-04 | Pago manual → aparece en el historial con el monto correcto | ADMIN | P0 | E2E |
| PAY-05 | Checkout en sandbox cobra el precio exacto del plan (CLP sin /100) | MEMBER | P0 | MAN |

### FIN — Conciliación Fintoc
| ID | Caso | Rol | P | Capa |
|---|---|---|---|---|
| FIN-01 | Lista muestra el movimiento calzado por RUT y el sin identificar | ADMIN | P0 | E2E |
| FIN-02 | Confirmar el movimiento calzado → activa la membresía de Fernanda | ADMIN | P0 | E2E |
| FIN-03 | Rechazar el movimiento sin identificar | ADMIN | P1 | E2E |
| FIN-04 | Conectar banco con el widget (sandbox) y sincronizar | ADMIN | P1 | MAN |

### IA — Alertas IA
| ID | Caso | Rol | P | Capa |
|---|---|---|---|---|
| IA-01 | Alertas de retención incluyen a Mateo Riesgo | ADMIN | P0 | E2E |
| IA-02 | Proyección por alumno (requiere `ANTHROPIC_API_KEY`) | ADMIN | P1 | EXP |
| IA-03 | Sin API key → error claro, sin romper la página | ADMIN | P2 | EXP |

### COM — Comunicaciones
| ID | Caso | Rol | P | Capa |
|---|---|---|---|---|
| COM-01 | Enviar a un plan → solo destinatarios de ese plan | ADMIN | P1 | E2E |
| COM-02 | Plantillas de correo: editar y enviar prueba | ADMIN | P2 | EXP |

### CFG — Configuración
| ID | Caso | Rol | P | Capa |
|---|---|---|---|---|
| CFG-01 | Editar datos del gym y ventanas de reserva → persiste | ADMIN | P1 | E2E |
| CFG-02 | Logo: subir y ver | ADMIN | P1 | E2E |
| CFG-03 | Biblioteca de movimientos: agregar y quitar | ADMIN | P2 | EXP |
| CFG-04 | Tema y colores de marca se aplican | ADMIN | P2 | EXP |

### RPT / EVO — Reportes y evolución
| ID | Caso | Rol | P | Capa |
|---|---|---|---|---|
| RPT-01 | Reportes cargan con los datos del seed | ADMIN | P1 | E2E |
| EVO-01 | Evolución carga para ADMIN y COACH | COACH | P1 | E2E |

### SUP — Superadmin y sedes
| ID | Caso | Rol | P | Capa |
|---|---|---|---|---|
| SUP-01 | Lista de gyms incluye qa-box-norte y qa-box-sur | SUPER_ADMIN | P0 | E2E |
| SUP-02 | Cambiar de sede → entra al dashboard de ese gym | SUPER_ADMIN | P0 | E2E |
| SUP-03 | Crear gym nuevo | SUPER_ADMIN | P1 | EXP |
| SUP-04 | Suscripciones y configuración de plataforma | SUPER_ADMIN | P2 | EXP |

### SEC — Transversal de seguridad
| ID | Caso | Rol | P | Capa |
|---|---|---|---|---|
| SEC-01 | Admin de Sur no ve alumnos, clases, WODs ni pagos de Norte | ADMIN Sur | P0 | E2E |
| SEC-02 | Admin de Sur abre la URL de un alumno de Norte → 404 o vacío | ADMIN Sur | P0 | E2E |
| SEC-03 | Comprobante y avatar sin token o con token de otro gym → 401/403 | — | P0 | E2E |
| SEC-04 | Manipular IDs en formularios (classTypeId o planId de otro gym) → rechazado | ADMIN | P0 | EXP |
| SEC-05 | Inyección en campos de texto (HTML/JS en nombre de alumno) no se ejecuta | ADMIN | P1 | EXP |

### MOB — Flujos del alumno (por API hasta tener Maestro)
| ID | Caso | Rol | P | Capa |
|---|---|---|---|---|
| MOB-01 | Reservar la clase de las 21:00 de mañana → queda en el día correcto | MEMBER | P0 | EXP |
| MOB-02 | Cancelar dentro del plazo límite → rechazado | MEMBER | P0 | EXP |
| MOB-03 | Cargas personalizadas del WOD de hoy según los RMs (Back Squat 105 kg) | MEMBER | P1 | EXP |
| MOB-04 | Registrar resultado de un benchmark | MEMBER | P1 | EXP |
| MOB-05 | Subir comprobante de transferencia → aparece pendiente en la web | MEMBER | P0 | EXP |
| MOB-06 | Pantallas en teléfono real | MEMBER | P1 | MAN |

## 5. Cómo se corre

```bash
# Datos
cd apps/api && pnpm seed:qa

# Capa 1: E2E (con API y web levantadas)
cd apps/web && pnpm e2e                 # todo
pnpm e2e --grep "PAY-"                  # un módulo
pnpm e2e:report                         # informe HTML

# Capa 2: exploratoria (en Claude Code)
/qa-explore            # todos los módulos, un agente por módulo
/qa-explore pagos      # un módulo
```

Cada recorrido exploratorio deja un informe en `qa/reports/<fecha>/`: `REPORT.md` más las
capturas, y publica un resumen navegable.

## 6. Manual (capa 3)

- PAY-05: checkout en sandbox de cada pasarela que se vaya a usar. El monto cobrado debe ser igual a `priceCents` en CLP.
- FIN-04: widget de Fintoc en sandbox (confirmar el nombre del campo `exchangeToken`).
- MOB-06: app en teléfono real, sobre todo reservas nocturnas y el modal de benchmarks.
- Stripe: URL de webhook `/api/payments/webhook/stripe`.
- Producción: backup de la base de datos, `.env.production` y un smoke test tras el deploy.
