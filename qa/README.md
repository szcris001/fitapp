# QA — FitApp

Todo lo necesario para probar FitApp de punta a punta. La estrategia completa (capas, severidades
y matriz de casos) está en [docs/TESTING_STRATEGY.md](../docs/TESTING_STRATEGY.md).

| Qué | Dónde |
|---|---|
| Usuarios, gyms y planes del entorno QA | `fixtures.json` |
| Seed que crea ese entorno | `apps/api/src/scripts/seed-qa.ts` (`pnpm seed:qa`) |
| Suite E2E por módulo (Playwright) | `apps/web/e2e/modules/` |
| Fichas de los agentes exploradores | `charters/` |
| Agente explorador | `.claude/agents/qa-explorer.md` |
| Orquestador | `.claude/skills/qa-explore/SKILL.md` (`/qa-explore`) |
| Informes de cada recorrido (no se versionan) | `reports/<fecha>/` |

## Uso rápido

```bash
docker-compose up -d                      # Postgres + Redis
cd apps/api && pnpm dev                   # API :3001
cd apps/web && pnpm dev                   # Web :3000

cd apps/api && pnpm seed:qa               # datos QA (repetible)
cd apps/web && pnpm e2e                   # suite E2E completa (resiembra sola)
cd apps/web && pnpm e2e --grep "PAY-"     # un módulo
```

Recorrido exploratorio, desde Claude Code en la raíz del repo:

```
/qa-explore                 # todos los módulos
/qa-explore pagos,wods      # algunos
```

Contraseña de todos los usuarios QA: la de `fixtures.json`. El seed se niega a correr con
`NODE_ENV=production` y solo toca los gyms cuyo slug empieza con `qa-`.
