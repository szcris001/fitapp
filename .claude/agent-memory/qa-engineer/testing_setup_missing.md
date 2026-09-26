---
name: Framework de tests configurado en apps/api
description: vitest 4.1.5 instalado y funcionando en apps/api. apps/web y apps/mobile siguen sin framework de tests.
type: project
---

**Estado al 2026-04-30:**

`apps/api` CONFIGURADO:
- `vitest@4.1.5` y `@vitest/coverage-v8@4.1.5` en devDependencies
- `apps/api/vitest.config.ts` existe con globals:true, environment:node, coverage v8
- Scripts disponibles: `pnpm test` (run), `pnpm test:watch` (watch), `pnpm test:coverage` (coverage)
- 26 tests corriendo en 404ms

`apps/web` — SIN framework de tests (Next.js — necesitará jest+jest-environment-jsdom o vitest con jsdom)
`apps/mobile` — SIN framework de tests (React Native — necesitará jest+babel-jest o Maestro para E2E)

**How to apply:** Para apps/api, el setup ya existe. Para las otras apps, pendiente configurar cuando se llegue a E2E.
