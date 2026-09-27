# MEMORY.md

- [project_auth_refresh_token.md](project_auth_refresh_token.md) — Diseño de refresh token aprobado 2026-05-05: tabla RefreshToken, rotación activada, access 15min, refresh 7d
- [project_patterns.md](project_patterns.md) — Patrones arquitectónicos invariantes del proyecto (multi-tenancy, naming, patrón tabla token)
- [project_fintoc_design.md](project_fintoc_design.md) — Diseño Fintoc conciliación bancaria aprobado 2026-05-05: tablas FintocLink + BankMovement, matcher 3 fases, 7 endpoints
- [project_fintoc_payments_design.md](project_fintoc_payments_design.md) — Diseño Fintoc Payments (Pay by Bank) aprobado 2026-05-06: tabla FintocPaymentIntent, 3 endpoints, idempotencia doble barrera
- [project_wod_results_design.md](project_wod_results_design.md) — Diseño WOD Results + Leaderboard aprobado 2026-06-11: enum WodScoreType, tabla WodResult, 4 endpoints, formatScore en service
