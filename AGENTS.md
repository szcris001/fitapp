# AGENTS.md — Panel de Control del Equipo FitHub

> Plan Pro ($20/mes) · 1-2h/día · 3-4 invocaciones de subagente/día máximo.

Este archivo es tu mapa operativo. Lista los 8 agentes organizados por frecuencia
de uso real, con reglas específicas para maximizar cada token de tu Plan Pro.

---

## Regla #1: Modo directo vs subagente

NO invoques un subagente para todo. Para tareas simples, usa Claude Code
directamente (sin `> nombre-agente:`). Los subagentes los reservas para cuando
necesitas el system prompt especializado.

| Situación | Cómo | Por qué |
|---|---|---|
| Escribir tests | Subagente `qa-engineer` | Su prompt tiene las 7 zonas de riesgo y convenciones |
| Probar pasarela sandbox | Subagente `payments-specialist` | Su prompt tiene el checklist de 10 puntos |
| Diseñar modelo de datos nuevo | Subagente `architect` | Su prompt tiene las reglas de multi-tenancy |
| Implementar un endpoint ya diseñado | **Modo directo** | No necesitas prompt especial |
| Arreglar un bug | **Modo directo** | No necesitas prompt especial |
| Crear un componente web/mobile | **Modo directo** | No necesitas prompt especial |
| Pregunta rápida | **Modo directo** | No gastes una invocación en eso |

Esto te ahorra ~60% de tokens.

---

## Regla #2: Prompts cortos

En Plan Pro cada token cuenta. Formato recomendado:

```
> qa-engineer: tests unitarios de calculateLoad.
Plan en docs/PLAN_DE_PRUEBAS.md zona 1.
Sólo apps/api/src/modules/wods/__tests__/.
Update QUALITY.md.
```

Nombra archivos exactos. Di qué actualizar. No escribas párrafos de contexto.

---

## Regla #3: /status después de cada subagente

```
/status
```

Te muestra cuánto te queda del límite. Calibra tu presupuesto diario con datos
reales, no con suposiciones.

---

## El equipo

### 🔴 Principales (uso frecuente — 90% de tus invocaciones)

Estos 4 son tu equipo del día a día. Los invocas como subagentes con su nombre.

| Agente | Frecuencia | Cuándo | Comando ejemplo |
|---|---|---|---|
| **qa-engineer** | 60% de invocaciones | Después de cada feature. Tests de las 7 zonas de riesgo. Mantiene QUALITY.md. | `> qa-engineer: tests de multi-tenancy para students. Solo apps/api/.../students/__tests__/. Update QUALITY.md.` |
| **payments-specialist** | 20% de invocaciones | Pasarelas, webhooks, sandbox, conciliación. | `> payments-specialist: ejecuta punto 1 del checklist Stripe. Credenciales en .env.test.sandbox.` |
| **architect** | 10% de invocaciones | Antes de cambiar DB, feature nueva, o cuando hay inconsistencia entre módulos. | `> architect: diseña endpoint para marcar hito gimnástico. Lee prisma/schema.prisma.` |
| **backend-dev** | Cuando modo directo no basta | Features complejas que tocan múltiples módulos o requieren coordinación con architect. | `> backend-dev: implementa el diseño de docs/designs/gymnastic-progress.md.` |

### 🟠 Pre-deploy obligatorio

| Agente | Cuándo invocar | Frecuencia |
|---|---|---|
| **security** | **Obligatorio antes de cada release a producción.** También al agregar endpoints públicos, cambiar auth, o modificar lógica multi-tenancy. | Antes de cada deploy |

Qué hace: RLS en PostgreSQL, CORS estricto, cabeceras HTTP (CSP, HSTS, Helmet), rate limiting en auth, JWT hardening, checklist OWASP Top 10, verificación de aislamiento por `gymId`.

```
> security: ejecuta checklist pre-deploy completo.
Lee apps/api/src/index.ts, apps/web/next.config.ts y apps/api/prisma/schema.prisma.
Reporta hallazgos y aplica los controles faltantes.
```

---

### 🔵 Excepcionales (uso puntual — 10% de tus invocaciones)

Estos 4 existen y sus prompts están listos, pero **la mayoría de las veces
puedes resolver su trabajo en modo directo o simplemente no los necesitas aún**.

| Agente | Cuándo invocar como subagente | Cuándo usar modo directo en su lugar |
|---|---|---|
| **web-dev** | Feature compleja de admin con múltiples pantallas interconectadas | Crear/modificar un componente, arreglar un bug de UI, ajustar un form |
| **mobile-dev** | Feature compleja de app con navegación nueva o integración nativa | Modificar una pantalla, ajustar un componente, fix de estilo |
| **product-owner** | Cuando quieres agregar algo nuevo al MVP y necesitas contraparte | Cuando ya sabes que la respuesta es "no" o "después" |
| **devops** | Setup inicial de CI/CD, configurar ambientes, antes de primer deploy a prod | Agregar una variable de entorno, correr un seed |

**Ejemplo de cuándo usar product-owner como subagente vs no**:
- "Quiero agregar marketplace de profesionales" → **Sí invocalo**, es una decisión grande
- "Quiero agregar un campo al form de planes" → **No lo invoques**, eso ya está en el requirements

---

## Presupuesto diario (Plan Pro)

| Recurso | Presupuesto |
|---|---|
| Invocaciones de subagente | 3-4 por día |
| Invocaciones por semana | ~15-20 |
| Modelo por defecto | Sonnet (cambiar con `/model`) |
| Opus | Solo para diseño arquitectónico complejo |
| Uso de Claude.ai | Resta del mismo pool. Minimiza el chat web los días que trabajes con Claude Code |

---

## Rutina semanal

| Día | Foco | Invocaciones |
|---|---|---|
| Lun | Lee dashboards. 1 invocación qa-engineer para diagnóstico semanal. | 1 |
| Mar | Cerrar tests de una zona de riesgo. | 2-3 |
| Mié | Feature del backlog: architect → backend-dev (o modo directo). | 1-2 |
| Jue | UI o pasarela según prioridad. | 1-2 |
| Vie | Revisión solo. Tachar BACKLOG. Actualizar QUALITY.md. 0 invocaciones. | 0 |

---

## Dashboard — cada mañana (sin invocaciones)

```bash
cat QUALITY.md | head -30   # ¿Qué está verde, amarillo, rojo?
cat STATE.md                # ¿Qué hicieron los agentes ayer?
cat BACKLOG.md | head -50   # ¿Qué sigue?
```

Decides una tarea. Invocas al agente correspondiente. Esperas. Lees su output.
Decides si continúas o pasas a otro agente.

---

## Flujo típico de una feature nueva (modo cierre, Plan Pro)

```
1. ¿Es scope nuevo? → product-owner (como subagente solo si es decisión grande)

2. ¿Toca modelo de datos? → architect (subagente, 1 invocación)

3. Implementar → modo directo de Claude Code (sin subagente, ahorra tokens)
   Solo usa backend-dev como subagente si es algo que toca 3+ módulos.

4. Tests → qa-engineer (subagente, 1-2 invocaciones)

5. Merge cuando QUALITY.md está verde para esa zona.
```

---

## Flujo de cierre de pasarela

```
1. Tú: creas cuenta sandbox + configuras credenciales (ver docs/SANDBOX_SETUP.md)
2. payments-specialist: ejecuta checklist punto por punto (2-3 invocaciones)
3. qa-engineer: valida y actualiza QUALITY.md (1 invocación)
```

---

## Señales de alerta

- Si usas 5+ invocaciones/día consistentemente → algo se puede hacer en modo directo
- Si un agente lee más de 5 archivos → la próxima vez sé más específico en qué leer
- Si te chocas el límite 2+ veces/semana → activa Extra Usage ($5-10 pay-as-you-go) antes de subir a Max
- Si la respuesta de un agente es genérica → falta contexto en STATE.md, actualízalo

---

## Comandos rápidos de Claude Code

| Comando | Qué hace |
|---|---|
| `claude` | Abre Claude Code |
| `/status` | Cuánto te queda del límite |
| `/model sonnet` | Cambiar a Sonnet (default recomendado) |
| `/clear` | Limpiar contexto entre tareas |
| `/exit` o `Ctrl+D` | Salir |
