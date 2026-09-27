# MEMORY.md

- [feedback_flaky_tests.md](feedback_flaky_tests.md) — Patrón try/finally para cleanup de DB en tests de integración con usuarios temporales
- [feedback_vitest_mock_consumption.md](feedback_vitest_mock_consumption.md) — mockResolvedValueOnce se consume en orden de ejecución de DB queries, no de test
- [feedback_tenancy_user_endpoints.md](feedback_tenancy_user_endpoints.md) — Validar gymId cuando userId llega como param de ruta (no del JWT); devolver null+404, nunca 403
- [feedback_prisma_generate_after_migrate.md](feedback_prisma_generate_after_migrate.md) — Correr `prisma generate` explícitamente después de migrate si el build falla con "Property X does not exist on PrismaClient"
- [feedback_leaderboard_rank_pattern.md](feedback_leaderboard_rank_pattern.md) — Patrón para rank independiente por categoría (RX vs Scaled): filter→map con index+1→concat
- [feedback_prisma_createmany_no_relations.md](feedback_prisma_createmany_no_relations.md) — prisma.createMany no soporta relaciones (connect/set); usar update en segundo paso
