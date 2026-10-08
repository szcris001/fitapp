---
name: dependency-audit-pattern
description: Cómo FitApp gestiona hallazgos de pnpm audit --audit-level=high en dependencias transitivas
metadata:
  type: project
---

El repo usa `pnpm-workspace.yaml` (NO `package.json` raíz) para dos mecanismos de gestión de `pnpm audit`:

1. **`overrides:`** — fuerza versión mínima parchada de un paquete transitivo vulnerable, acotado al mismo major (ej. `source-map-js@1: ">=1.2.2 <2"`). Se usa cuando SÍ hay versión parchada compatible sin bumpear el paquete padre (vitest, expo, etc.). Patrón: una línea por `paquete@major`, con comentario arriba explicando que son parches temporales a revisar cuando el padre los incluya.
2. **`auditConfig.ignoreGhsas:`** — lista de GHSA IDs a ignorar cuando NO existe versión parchada todavía (`Patched versions: <0.0.0`) o el paquete solo se usa en tooling de build/dev sin exposición real (ej. prisma CLI, metro, nodemon). Cada entrada lleva un comentario arriba justificando por qué es seguro ignorarla.

**Why:** El gate de CI (`pnpm audit --audit-level=high`) no distingue dependencias de runtime vs. devDependencies de tooling (vitest coverage, expo CLI, nodemon, prisma CLI) — bloquea igual. Este patrón permite mantener el gate verde sin bumpear majors que podrían romper algo, documentando cada excepción.

**How to apply:** Ante un hallazgo `high`/`critical` nuevo: 1) `pnpm why <paquete> -r` para ver si hay un único resolved version en el monorepo (si hay varios majors en conflicto, el override simple no sirve); 2) `npm view <paquete> versions --json` para confirmar que la versión parchada es un patch/minor dentro del mismo major ya en uso; 3) si sí, agregar/ajustar línea en `overrides:`; si no hay fix disponible, agregar a `ignoreGhsas` con comentario explicando el motivo (tooling-only, sin exposición en producción).

**Importante:** La base de advisories (GHSA) se actualiza en tiempo real — un hallazgo nuevo puede aparecer entre que se reproduce el audit y que se corre `pnpm install` minutos después. Verificar con `pnpm audit --json | jq` el campo `created`/`updated` del advisory si algo inesperado aparece, antes de asumir que es un efecto secundario de los cambios propios.

Ver PR #88 (`fix/security-audit-high-vulns`, 2026-10-06) como ejemplo: fix de `source-map-js`, `compression` y un `shell-quote` crítico publicado el mismo día.
