# BACKLOG.md — Trabajo Pendiente FitHub

> Este es el "20% que falta" del MVP, priorizado. Solo el **product-owner** puede agregar items nuevos. Los devs tachan al cerrar (`[x]`).

**Convenciones**:
- `[ ]` pendiente, `[x]` hecho, `[~]` en progreso, `[!]` bloqueado
- Prefijos: `[BUG]` reporte de qa, `[NEW]` feature nueva aprobada, `[CLOSE]` cierre de algo a medias
- Cada item tiene: descripción · sección del requirements · agente responsable · estimación

---

## 🔴 Crítico (bloquea release MVP)

### Pagos

- [ ] `[CLOSE]` Cerrar Stripe contra sandbox (10 puntos del checklist) · §3.4.2 · payments-specialist · 2-3 días
- [ ] `[CLOSE]` Cerrar Mercado Pago contra sandbox · §3.4.2 · payments-specialist · 2-3 días
- [ ] `[CLOSE]` Webhooks con idempotencia y validación de firma · §3.4.2 · payments-specialist · 1-2 días
- [ ] `[CLOSE]` Renovación automática con Stripe (job + reintentos) · §3.4.4 · payments-specialist · 2 días
- [ ] `[CLOSE]` Subida y revisión de comprobante de transferencia · §3.4.3 modalidad A · web-dev + mobile-dev · 1-2 días

### Cálculos críticos

- [ ] `[CLOSE]` Tests unitarios de cálculo de carga personalizada (15+ casos) · §3.3.3 punto 4 · qa-engineer · 1 día
- [ ] `[CLOSE]` Verificar redondeo configurable por gym (0.5 / 1 / 2.5 kg) · §3.3.3 · qa-engineer · 0.5 día

### Multi-tenancy

- [ ] `[CLOSE]` Suite de tests de aislamiento entre gyms (todas las entidades) · §8 · qa-engineer · 2 días
- [ ] `[CLOSE]` Auditoría de queries Prisma sin `gymId` en where · §8 · architect + backend-dev · 1 día

### Seed de benchmarks

- [ ] `[CLOSE]` Script de seed idempotente con 27 Girls, Heroes oficiales, Open desde 2011, Games · §3.3.3 · devops · 2 días
- [ ] `[CLOSE]` Script de append anual para Open/Games · §3.3.3 · devops · 0.5 día
- [ ] `[CLOSE]` Test del seed (idempotencia + conteos correctos) · qa-engineer · 0.5 día

---

## 🟡 Importante (necesario para MVP pero no bloquea release inicial)

### Pasarelas restantes

- [ ] Cerrar Khipu sandbox · payments-specialist · 1-2 días
- [ ] Cerrar Flow sandbox · payments-specialist · 1-2 días
- [ ] Cerrar MACH sandbox · payments-specialist · 1-2 días
- [ ] Cerrar Kushki sandbox · payments-specialist · 1-2 días
- [ ] Cerrar PayU sandbox · payments-specialist · 1-2 días
- [ ] Cerrar OpenPay sandbox · payments-specialist · 1-2 días
- [ ] PayPal: dejar codeado pero desactivado por defecto · payments-specialist · 0.5 día

### Conciliación bancaria

- [ ] Integración con Fintoc para CL · §3.4.3 modalidad B · payments-specialist · 3-4 días
- [ ] Lógica de matcher (monto + RUT + código de referencia) · §3.4.3 · payments-specialist · 2 días
- [ ] Tests del matcher con fixtures de movimientos · §3.4.3 · qa-engineer · 1 día

### Importación Excel

- [ ] `[CLOSE]` Validación de plantilla Excel (columnas, tipos) · §3.3.3 · backend-dev · 1 día
- [ ] `[CLOSE]` Tests de importación (válido, columnas faltantes, datos inválidos) · qa-engineer · 1 día

### IA de retención

- [ ] `[CLOSE]` Endpoint y UI de alertas proactivas (riesgo de abandono, vencimiento, ausencia) · §3.7 · backend-dev + web-dev · 2-3 días
- [ ] `[CLOSE]` Proyección de objetivos del atleta · §3.7 · backend-dev + mobile-dev · 2-3 días

---

## 🟢 Menor (pulir antes de release)

- [ ] Branding dinámico (3 colores) consistente en web y mobile · §3.6 · web-dev + mobile-dev · 1 día
- [ ] Indicador de planificación sin WOD en dashboard · §3.1 · web-dev · 0.5 día
- [ ] Indicador de asistencia por horario · §3.1 · web-dev · 1 día
- [ ] Panel de evolución de alumnos colectivo e individual · §3.1 · web-dev · 1-2 días
- [ ] Términos y condiciones propios del centro · §3.6 · web-dev · 0.5 día
- [ ] Notificaciones push (Firebase/OneSignal) · §3.5, §7 · devops + mobile-dev · 1-2 días
- [ ] Correos automatizados con plantillas (SendGrid/Resend) · §3.5, §7 · devops + backend-dev · 1 día

---

## 🚀 Pre-release

- [ ] Setup de Sentry en api, web, mobile · devops · 0.5 día
- [ ] Configurar staging con seed completo · devops · 0.5 día
- [ ] E2E de flujo crítico: alumno se registra → paga con Stripe → reserva → ve WOD · qa-engineer · 1-2 días
- [ ] Smoke test manual de todos los flujos en staging · qa-engineer + Cristian · 0.5 día
- [ ] Configurar deploy a producción con aprobación manual · devops · 0.5 día

---

## 📦 Backlog post-MVP (NO tocar ahora — solo product-owner puede mover acá)

- Multiplanes por alumno · §5 · v2
- Multi-sede · §5 · v2
- Marketplace de profesionales · §4 · Fase 2
- Webpay Plus (Transbank CL) · §5
- Multi-idioma inglés · §8
- Exportación/importación CSV de alumnos · §5
- Reportes avanzados · §5

---

## Bugs reportados (sin clasificar todavía)

[Acá el qa-engineer agrega los bugs encontrados con prefijo `[BUG]`]

---

**Total estimado del cierre crítico (🔴)**: ~15-20 días de trabajo concentrado.
**Total estimado de todo (🔴+🟡+🟢+pre-release)**: ~40-50 días de trabajo concentrado.
