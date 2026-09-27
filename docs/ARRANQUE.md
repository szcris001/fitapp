# Cómo arrancar mañana lunes — Guía para Plan Pro

> Plan Pro · 1-2h/día · 3-4 invocaciones de subagente máximo · Sonnet por default.

---

## Paso 0 — Preparación (5 min)

```bash
cd ~/fithub  # Tu ruta real al repo

mkdir -p .claude/agents docs
```

Copia los archivos del paquete:

```bash
# Desde donde descargaste/descomprimiste el zip
cp fithub-team/.claude/agents/*.md .claude/agents/
cp fithub-team/dashboard/AGENTS.md .
cp fithub-team/dashboard/STATE.md .
cp fithub-team/dashboard/BACKLOG.md .
cp fithub-team/dashboard/QUALITY.md .
cp fithub-team/docs/PLAN_DE_PRUEBAS.md docs/
cp fithub-team/docs/SANDBOX_SETUP.md docs/   # Si ya lo descargaste
```

Commitea:

```bash
git checkout -b feat/agents-team
git add .claude AGENTS.md STATE.md BACKLOG.md QUALITY.md docs/
git commit -m "chore: introducir equipo de agentes y dashboard de calidad"
```

---

## Paso 1 — Validar que el equipo está vivo (5 min, 1 invocación)

```bash
cd ~/fithub
claude
```

Primer comando — deliberadamente simple:

```
> qa-engineer: lee QUALITY.md, BACKLOG.md y STATE.md.
Dame las 3 prioridades de esta semana en orden.
NO escribas tests todavía.
Update STATE.md sección qa-engineer.
```

Si el agente responde con un análisis concreto y actualiza STATE.md, el equipo
está vivo. Si da una respuesta genérica, falta que lea los archivos — repite
diciéndole exactamente qué leer.

Después del output:

```
/status
```

Anota cuánto consumió. Esa es tu línea base para presupuestar el día.

---

## Paso 2 — Primer ✅ verde (1-1.5h, 2 invocaciones)

Tu primera victoria es la más fácil y la que más confianza da:

```
> qa-engineer: tests unitarios de calculateLoad.
Plan en docs/PLAN_DE_PRUEBAS.md zona 1.
Sólo crear apps/api/src/modules/wods/__tests__/load-calculator.test.ts.
Si la función no existe con ese nombre, dime dónde está la lógica.
```

Si la función existe, el agente escribe 15-17 tests. Si no existe o está en otro
lugar, te avisa y tú decides si lo arreglas en modo directo o invocas a backend-dev.

Segunda invocación (si la primera encontró la función):

```
> qa-engineer: corre los tests que escribiste.
Reporta resultado. Si todos pasan, update QUALITY.md con ✅.
Si fallan, reporta cuáles y por qué en STATE.md.
```

**Resultado esperado**: primer ✅ en QUALITY.md. Celebra.

```
/status
```

---

## Paso 3 — Decidir el orden de la semana (10 min, tú solo, 0 invocaciones)

Lee `BACKLOG.md` sección 🔴 Crítico. Orden recomendado para las primeras 4 semanas:

| Semana | Foco | Agente principal | Invocaciones ~totales |
|---|---|---|---|
| 1 | Cálculo de carga + setup Postgres test + multi-tenancy | qa-engineer | 8-10 |
| 2 | Stripe sandbox completo (10 puntos del checklist) | payments-specialist + qa | 8-10 |
| 3 | Mercado Pago sandbox + transferencia manual | payments-specialist + qa | 8-10 |
| 4 | Renovación automática + importación Excel | qa-engineer + backend-dev | 8-10 |

---

## Paso 4 — Rutina diaria

**Cada mañana (sin invocaciones):**

```bash
cat QUALITY.md | head -30
cat STATE.md
cat BACKLOG.md | head -50
```

Decides UNA tarea. Invocas al agente correspondiente. Esperas. Lees output.
Decides si continúas o pasas a otra cosa.

**Budget diario:**
- 3-4 invocaciones de subagente
- Resto del trabajo en modo directo de Claude Code
- `/status` después de cada subagente
- Sonnet siempre. Opus solo si el architect necesita pensar algo complejo.

**Cada viernes (0 invocaciones):**
- ¿Cuántos verdes nuevos hay en QUALITY.md?
- Tachar lo cerrado en BACKLOG.md
- Si 2 viernes seguidos sin verdes nuevos → recalibrar

---

## Paso 5 — Referencia rápida de decisiones

| Situación | Qué hago |
|---|---|
| Implementar endpoint simple | Modo directo, sin subagente |
| Arreglar bug de UI | Modo directo |
| Escribir tests de zona de riesgo | Subagente qa-engineer |
| Probar pasarela en sandbox | Subagente payments-specialist |
| Diseñar modelo de datos nuevo | Subagente architect |
| Feature compleja multi-módulo | Subagente backend-dev |
| "¿Esto es MVP?" | Subagente product-owner (solo decisiones grandes) |
| Deploy a staging/prod | Subagente devops (solo cuando QUALITY.md lo permita) |
| Crear componente, arreglar estilo | Modo directo (NO invoques web-dev/mobile-dev) |
| "Estoy perdido" | Lee QUALITY.md → ataca el ❌ más urgente |

---

## Errores comunes

1. **Invocar subagente para todo.** El 70% del trabajo se hace en modo directo.
   Los subagentes son para cuando necesitas el prompt especializado.

2. **Prompts largos con mucho contexto.** Nombra archivos exactos. El agente
   los lee solo. No copies contenido en el prompt.

3. **No revisar /status.** Si no sabes cuánto te queda, vas a chocarte el
   límite en el peor momento.

4. **Olvidar "update STATE.md".** Sin eso, mañana arrancas de cero.

5. **Saltarte al qa-engineer.** Es la tentación: "ya funciona, no necesito
   tests". Sí los necesitas. Por eso estás estancado al 80%.

6. **Abrir features nuevas antes de cerrar las abiertas.** BACKLOG.md te
   protege de esto. Respétalo.

---

## Cuándo subir de plan

Quédate en Pro hasta que se cumpla:

- Te chocas el límite **2+ veces/semana** por 2 semanas seguidas
- Una invocación crítica se interrumpe y tienes que esperar 5h

Primero prueba **Extra Usage** ($5-10 pay-as-you-go). Solo si eso tampoco
basta, evalúa Max 5x.

---

## Cuándo volver a pedir ayuda

- Después de 2 semanas sin 3+ verdes nuevos en QUALITY.md
- Un agente da respuestas genéricas
- Sientes que trabajas MÁS que antes
- Decisión grande de scope (cambiar stack, agregar marketplace)
