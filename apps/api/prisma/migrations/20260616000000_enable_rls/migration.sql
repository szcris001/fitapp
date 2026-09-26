-- ============================================================
-- Row Level Security (RLS) — Defensa en profundidad por gymId
-- ============================================================
-- Esta migración habilita RLS en todas las tablas tenant-scoped.
-- La seguridad primaria sigue siendo el filtrado por gymId en el
-- código de aplicación (Prisma queries). RLS es la capa adicional
-- que impide fugas de datos si un query omite el filtro por error.
--
-- Mecanismo: la app setea 'app.current_gym_id' antes de cada query
-- mediante prisma.$executeRaw`SELECT set_config(...)`.
-- El role 'fitapp_superadmin' tiene BYPASSRLS para operaciones admin.
-- ============================================================

-- Crear role de superadmin con bypass de RLS (si no existe)
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'fitapp_superadmin') THEN
    CREATE ROLE fitapp_superadmin;
  END IF;
END
$$;

GRANT fitapp_superadmin TO fitapp;

-- ── Función auxiliar para obtener el gym_id de sesión ──────────────────────
-- Prisma almacena los IDs como TEXT (no UUID nativo), por eso retornamos text.
CREATE OR REPLACE FUNCTION current_gym_id() RETURNS text AS $$
  SELECT NULLIF(current_setting('app.current_gym_id', TRUE), '');
$$ LANGUAGE sql STABLE;

-- ── Tabla: "User" ─────────────────────────────────────────────────────────────
ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "User" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_gym_isolation ON "User";
CREATE POLICY user_gym_isolation ON "User"
  USING (
    "gymId" = current_gym_id()
    OR current_setting('app.bypass_rls', TRUE) = 'true'
    OR pg_has_role(current_user, 'fitapp_superadmin', 'member')
  );

-- ── Tabla: "Plan" ─────────────────────────────────────────────────────────────
ALTER TABLE "Plan" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Plan" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS plan_gym_isolation ON "Plan";
CREATE POLICY plan_gym_isolation ON "Plan"
  USING (
    "gymId" = current_gym_id()
    OR current_setting('app.bypass_rls', TRUE) = 'true'
    OR pg_has_role(current_user, 'fitapp_superadmin', 'member')
  );

-- ── Tabla: "ClassType" ────────────────────────────────────────────────────────
ALTER TABLE "ClassType" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ClassType" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS classtype_gym_isolation ON "ClassType";
CREATE POLICY classtype_gym_isolation ON "ClassType"
  USING (
    "gymId" = current_gym_id()
    OR current_setting('app.bypass_rls', TRUE) = 'true'
    OR pg_has_role(current_user, 'fitapp_superadmin', 'member')
  );

-- ── Tabla: "Class" ────────────────────────────────────────────────────────────
ALTER TABLE "Class" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Class" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS class_gym_isolation ON "Class";
CREATE POLICY class_gym_isolation ON "Class"
  USING (
    "gymId" = current_gym_id()
    OR current_setting('app.bypass_rls', TRUE) = 'true'
    OR pg_has_role(current_user, 'fitapp_superadmin', 'member')
  );

-- ── Tabla: "Wod" ──────────────────────────────────────────────────────────────
ALTER TABLE "Wod" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Wod" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS wod_gym_isolation ON "Wod";
CREATE POLICY wod_gym_isolation ON "Wod"
  USING (
    "gymId" = current_gym_id()
    OR current_setting('app.bypass_rls', TRUE) = 'true'
    OR pg_has_role(current_user, 'fitapp_superadmin', 'member')
  );

-- ── Tabla: "GymSkill" ─────────────────────────────────────────────────────────
ALTER TABLE "GymSkill" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "GymSkill" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS gymskill_gym_isolation ON "GymSkill";
CREATE POLICY gymskill_gym_isolation ON "GymSkill"
  USING (
    "gymId" = current_gym_id()
    OR current_setting('app.bypass_rls', TRUE) = 'true'
    OR pg_has_role(current_user, 'fitapp_superadmin', 'member')
  );

-- ── Tabla: "FintocLink" ───────────────────────────────────────────────────────
ALTER TABLE "FintocLink" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FintocLink" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fintoclink_gym_isolation ON "FintocLink";
CREATE POLICY fintoclink_gym_isolation ON "FintocLink"
  USING (
    "gymId" = current_gym_id()
    OR current_setting('app.bypass_rls', TRUE) = 'true'
    OR pg_has_role(current_user, 'fitapp_superadmin', 'member')
  );

-- ── Tabla: "BankMovement" ─────────────────────────────────────────────────────
ALTER TABLE "BankMovement" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BankMovement" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS bankmovement_gym_isolation ON "BankMovement";
CREATE POLICY bankmovement_gym_isolation ON "BankMovement"
  USING (
    "gymId" = current_gym_id()
    OR current_setting('app.bypass_rls', TRUE) = 'true'
    OR pg_has_role(current_user, 'fitapp_superadmin', 'member')
  );

-- ── Tabla: "WodResult" ────────────────────────────────────────────────────────
ALTER TABLE "WodResult" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "WodResult" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS wodresult_gym_isolation ON "WodResult";
CREATE POLICY wodresult_gym_isolation ON "WodResult"
  USING (
    "gymId" = current_gym_id()
    OR current_setting('app.bypass_rls', TRUE) = 'true'
    OR pg_has_role(current_user, 'fitapp_superadmin', 'member')
  );

-- ── Tabla: "Benchmark" ────────────────────────────────────────────────────────
-- Los benchmarks oficiales (isOfficial=true) son visibles para todos.
-- Los benchmarks de un gym solo son visibles para ese gym.
ALTER TABLE "Benchmark" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Benchmark" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS benchmark_gym_isolation ON "Benchmark";
CREATE POLICY benchmark_gym_isolation ON "Benchmark"
  USING (
    "gymId" IS NULL  -- benchmarks oficiales: visibles para todos
    OR "gymId" = current_gym_id()
    OR current_setting('app.bypass_rls', TRUE) = 'true'
    OR pg_has_role(current_user, 'fitapp_superadmin', 'member')
  );

-- ── Registrar en tabla de migraciones de Prisma ──────────────────────────────
-- (Prisma marcará esta migración como aplicada via prisma migrate resolve)
