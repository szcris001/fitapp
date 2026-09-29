---
name: qa-explore
description: Recorrido exploratorio de FitApp con agentes que usan la web en un navegador real (capa 2 de docs/TESTING_STRATEGY.md). Resiembra el entorno QA, lanza un agente qa-explorer por módulo en paralelo y consolida un informe con hallazgos por severidad. Uso — /qa-explore (todos), /qa-explore pagos, /qa-explore pagos,wods.
argument-hint: "[módulo[,módulo...]] | todos"
disable-model-invocation: true
---

# /qa-explore — recorrido exploratorio con agentes

Respondes en español. Orquestas; no exploras tú mismo.

## 1. Módulos

Los módulos válidos son los archivos de `qa/charters/*.md` (sin extensión). Sin argumento o con `todos` se corren todos. Si el argumento nombra un módulo que no existe, muestra la lista y detente.

## 2. Preflight (detente y explica si algo falla)

1. La API responde: `curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/api/platform/assets` → 200. Si no, se levanta con `cd apps/api && pnpm dev`, con Postgres y Redis (`docker-compose up -d`).
2. La web responde: `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/login` → 200. Si no, se levanta con `cd apps/web && pnpm dev`.
3. Navegador del MCP: si no existe `~/.cache/ms-playwright/chromium-1247`, instálalo con `npx -y @playwright/mcp@0.0.83 install-browser chrome-for-testing` (unos 120 MB).
4. Rate limit: con varios agentes en paralelo, `apps/api/.env` debería tener `RATE_LIMIT_MAX=2000` y `AUTH_RATE_LIMIT_MAX=500`, que solo se aplican fuera de producción. Si faltan, avisa: con los valores por defecto aparecerán respuestas 429.

## 3. Preparar el recorrido

1. Resiembra: `cd apps/api && pnpm seed:qa`. Solo toca los gyms `qa-*`.
2. Carpeta: `RUN=$(date +%Y-%m-%d-%H%M)` → `mkdir -p qa/reports/$RUN`.

## 4. Lanzar exploradores

- Lanza agentes `qa-explorer` en paralelo, **en tandas de hasta 5**, todos los de una tanda en un solo mensaje y en segundo plano. Espera a que termine una tanda antes de lanzar la siguiente.
- Orden de tandas (los módulos que modifican más datos van al final):
  1. auth, dashboard, alumnos, planes, clases
  2. wods, ia, reportes, alumno-api, comunicaciones
  3. pagos, conciliacion, configuracion, superadmin, seguridad
- Prompt de cada agente (reemplaza los valores):

  > Módulo: `<módulo>`. Ficha: `qa/charters/<módulo>.md`. Carpeta del recorrido: `qa/reports/<RUN>/`. Escribe tu informe en `qa/reports/<RUN>/<módulo>.md` y tus capturas en `qa/reports/<RUN>/<módulo>/`. Otros exploradores trabajan al mismo tiempo sobre la misma base de datos: respeta los límites de tu definición.

- Si un agente falla o no deja informe, anótalo en el consolidado como «sin informe» y sigue con los demás.

## 5. Consolidar

Lee todos los `qa/reports/<RUN>/<módulo>.md` y escribe `qa/reports/<RUN>/REPORT.md`:

```markdown
# Recorrido exploratorio <RUN>

## Resumen
| Módulo | S1 | S2 | S3 | S4 | Cobertura | Informe |
|---|---|---|---|---|---|---|

## Críticos y altos (S1/S2)
<cada hallazgo: módulo, título, pasos en una línea y link a su sección del informe>

## Patrones
<causas que se repiten en varios módulos, p. ej. «fechas en UTC», que conviene arreglar de una vez>

## Próximos pasos
<qué arreglar primero y qué hallazgos convertir en tests (ID de caso propuesto)>
```

Antes de listar un S1 o un S2, verifica tú mismo que la evidencia lo respalde (captura o respuesta de la API). Si no se sostiene, bájalo de severidad y anótalo.

## 6. Entregar

- Publica el consolidado como Artifact: una página con la tabla por módulo y los hallazgos S1 y S2 con sus capturas. Carga antes la skill de diseño de artifacts.
- En el chat: la severidad total, los 3 a 5 hallazgos más graves, el link al Artifact y la ruta de `REPORT.md`.
- Ofrece el siguiente paso: arreglar los S1 y S2 en una rama y convertir cada hallazgo confirmado en un test de `apps/web/e2e/modules` o de `apps/api`, como exige la estrategia.
