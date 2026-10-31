---
name: feedback-memory-path
description: Escribir SIEMPRE la propia memoria en la raíz del repo, nunca dentro de apps/web ni apps/api
metadata:
  type: feedback
---

Ya pasó dos veces en la misma sesión (2026-10-30 y 2026-10-31): los archivos de memoria de este agente se escribieron en `apps/web/.claude/agent-memory/payments-specialist/` en vez de la ruta correcta `.claude/agent-memory/payments-specialist/` (raíz del repo, al mismo nivel que `apps/`, `STATE.md`, `CLAUDE.md`). Quedaba un directorio `apps/web/.claude/` espurio detectable con `git status`.

**Why**: el working directory de la sesión a veces es `apps/web/` o `apps/api/` cuando el agente termina de tocar `payments.routes.ts`/`.schema.ts` justo antes de escribir la memoria, y una ruta relativa `.claude/agent-memory/...` desde ahí cae un nivel más adentro de lo debido.

**How to apply**: antes de escribir cualquier archivo de memoria, confirmar el cwd (`pwd`) o usar la ruta absoluta desde la raíz del repo (`/home/cristiansilva/fitapp/.claude/agent-memory/payments-specialist/`). Si el agente ve un directorio `apps/*/\.claude/` en `git status` antes de terminar, es señal de este mismo error — moverlo a la raíz, no commitearlo donde quedó.
