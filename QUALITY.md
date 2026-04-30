# QUALITY.md — Termómetro de Calidad FitHub

> Mantenido por el **qa-engineer**. Es lo primero que mira Cristian en la mañana.

**Última actualización**: [fecha — qa-engineer]

**Leyenda**:
- ✅ Verde: tests cubriendo, todos pasando
- ⚠️ Amarillo: parcialmente cubierto, o algunos fallando
- ❌ Rojo: sin cobertura o fallando crítico
- ⏸️ No aplica todavía (feature no implementada)

---

## 🎯 Resumen ejecutivo

| Categoría | Estado | Notas |
|---|---|---|
| Cálculos críticos | ❌ | Sin tests aún |
| Multi-tenancy | ❌ | Sin tests aún |
| Pasarelas | ❌ | 9 codeadas, 0 probadas |
| Conciliación bancaria | ⏸️ | Pendiente implementar Fintoc |
| Renovación automática | ❌ | Sin tests del job |
| Importación Excel | ❌ | Sin tests |
| Seed de benchmarks | ⏸️ | Pendiente implementar |
| Auth y multi-rol | ❌ | Sin tests |
| Web admin (E2E) | ❌ | Sin E2E |
| App móvil (E2E) | ❌ | Sin E2E |

**Veredicto**: NO APTO PARA RELEASE. Cobertura de tests ~0%.

---

## 🧮 Capa 1 — Tests unitarios (lógica pura)

| Suite | Estado | Tests | Cobertura |
|---|---|---|---|
| Cálculo de carga personalizada | ❌ | 0 | 0% |
| Validación de Zod schemas | ❌ | 0 | 0% |
| Transición de estados de Payment | ❌ | 0 | 0% |
| Lógica de redondeo configurable | ❌ | 0 | 0% |
| Validación de planes (tipos de clase, fechas, capacidad) | ❌ | 0 | 0% |
| Matcher de conciliación (Fintoc) | ⏸️ | 0 | 0% |
| Cálculo de proyecciones IA | ❌ | 0 | 0% |

**Objetivo**: 90%+ cobertura en lógica pura.

---

## 🔌 Capa 2 — Tests de integración (API + DB real)

| Suite | Estado | Tests |
|---|---|---|
| Auth (login, registro, refresh) | ❌ | 0 |
| Students CRUD | ❌ | 0 |
| Classes CRUD | ❌ | 0 |
| Plans CRUD | ❌ | 0 |
| Payments CRUD | ❌ | 0 |
| RMs y progresión gimnástica | ❌ | 0 |
| WOD planning | ❌ | 0 |
| **Multi-tenancy (aislamiento entre gyms)** | ❌ | 0 |
| Webhooks de pasarelas (idempotencia) | ❌ | 0 |
| Job de renovación automática (con time-travel) | ❌ | 0 |
| Importación Excel | ❌ | 0 |
| Seed de benchmarks (idempotencia) | ⏸️ | 0 |

**Objetivo**: 70%+ de endpoints cubiertos.

---

## 💳 Capa 3 — Tests de pasarelas (sandbox real)

Cada pasarela debe pasar el checklist de 10 puntos definido en `payments-specialist.md`.

| Pasarela | Estado | Puntos del checklist |
|---|---|---|
| Stripe | ❌ | 0/10 |
| Mercado Pago | ❌ | 0/10 |
| Khipu | ❌ | 0/8 (no tokeniza, son 8) |
| Flow | ❌ | 0/8 |
| PayU | ❌ | 0/9 (parcial tokenización) |
| Kushki | ❌ | 0/10 |
| OpenPay | ❌ | 0/9 |
| MACH | ❌ | 0/8 |
| PayPal | ⏸️ | desactivado por defecto |
| Fintoc (conciliación) | ⏸️ | pendiente implementar |

**Cuándo se considera ✅**: 100% del checklist verde para esa pasarela.

---

## 🌐 Capa 4 — Tests E2E

### Web admin (Playwright)

| Flujo | Estado |
|---|---|
| Login admin → ver dashboard con métricas | ❌ |
| Crear plan → asignar pasarelas → ver disponible para alumno | ❌ |
| Crear tipo de clase CrossFit → planificar WOD del día → publicar | ❌ |
| Importar planificación por Excel → validar datos cargados | ❌ |
| Confirmar comprobante de transferencia → estado plan se actualiza | ❌ |
| Ver alerta IA de alumno con riesgo de abandono | ❌ |

### Mobile alumno (Maestro/Detox)

| Flujo | Estado |
|---|---|
| Registro → login → ver clase del día | ❌ |
| Reservar clase dentro de ventana configurada | ❌ |
| Registrar RM nuevo → ver carga calculada en próximo WOD | ❌ |
| Marcar hito de progresión gimnástica | ❌ |
| Pagar plan con Stripe → ver plan activado | ❌ |
| Subir comprobante de transferencia | ❌ |
| Activar/desactivar auto-renew | ❌ |

**Objetivo**: 5-8 flujos críticos verdes. No más.

---

## 🚨 Bloqueadores actuales para release MVP

1. ❌ **Ninguna pasarela probada en sandbox real** — riesgo de cobros fallidos en producción.
2. ❌ **Multi-tenancy sin tests** — riesgo de fuga de datos entre gimnasios (catastrófico).
3. ❌ **Cálculo de carga sin tests** — riesgo de que un atleta cargue mal la barra y se lesione.
4. ❌ **Renovación automática sin tests** — riesgo de cobrar de más, de menos, o múltiples veces.
5. ❌ **Sin E2E de flujo "alumno paga y reserva"** — el caso de uso más básico, sin verificación.

---

## 📈 Histórico

[El qa-engineer agrega entradas aquí cuando algo cambia de rojo a verde, para ver progreso]

```
[fecha] Cálculo de carga personalizada: ❌ → ✅ (15 tests, 100% pass)
[fecha] Multi-tenancy: ❌ → ✅ (8 tests cubren todas las entidades)
...
```
