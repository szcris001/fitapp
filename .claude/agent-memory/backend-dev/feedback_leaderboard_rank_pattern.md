---
name: feedback_leaderboard_rank_pattern
description: Patrón para leaderboard con rank independiente por categoría (RX vs Scaled) en Prisma + Fastify
metadata:
  type: feedback
---

Al implementar leaderboards donde RX y Scaled tienen rank independiente pero se sirven en un solo array:

1. Recuperar todos los resultados de una vez con `findMany` (una sola query, con `orderBy` apropiado).
2. Separar en dos arrays con `.filter(r => r.rx)` y `.filter(r => !r.rx)`.
3. Mapear cada array con `index + 1` como rank y una propiedad `category: 'rx' | 'scaled'`.
4. Concatenar: `[...rxEntries, ...scaledEntries]` — RX va primero en el array de respuesta.

**Why:** El cliente necesita rank numérico correcto dentro de cada categoría. Si se calcula rank sobre el array completo mezclado, los rank de Scaled son incorrectos (no empiezan en 1).

**How to apply:** Cuando el leaderboard tenga dos categorías con rank independiente. Aplica también si se añaden más categorías (rookie, etc.).

Notas adicionales:
- `orderBy` para TIME es `{ score: 'asc' }`, para REPS/WEIGHT/ROUNDS es `{ score: 'desc' }`, para CUSTOM es `{ createdAt: 'asc' }`.
- El único index compuesto relevante para performance es `@@index([wodId, rx, score])` — cubre el caso de filtrar + ordenar.
- `formatScore` para TIME: `Math.floor(score/60) + ':' + String(Math.round(score%60)).padStart(2,'0')`.
