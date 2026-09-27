-- ============================================================================
-- Row Level Security aplicado de verdad (reemplaza 20260616000000_enable_rls y
-- 20260625000000_rls_missing_tables, que nunca protegieron nada: la app corría como
-- superusuario y las policies tenían `OR pg_has_role(current_user, 'fitapp_superadmin')`,
-- rol otorgado al propio usuario de la app).
--
-- Contexto por conexión (lo fija lib/prisma.ts al tomar cada conexión del pool):
--   app.current_gym_id  — gym del JWT del request
--   app.current_user_id — usuario del JWT (su propia fila de User es visible aunque
--                         opere otra sede tras /gyms/switch-sede)
--   app.bypass_rls      — 'on' para código de sistema sin request autenticado
--                         (cron, webhooks, login, superadmin sin gym, seeds)
-- Sin ninguna de esas variables (p. ej. psql con el rol de la app) no se ve ninguna fila.
--
-- La app debe conectarse con el rol fitapp_app (NOSUPERUSER, NOBYPASSRLS). La
-- contraseña/LOGIN la fija scripts/setup-app-db-role.ts (no va en una migración).
-- ============================================================================

-- ── Limpiar el esquema anterior: todas las policies y el rol con bypass ──────
DO $$
DECLARE p record;
BEGIN
  FOR p IN SELECT policyname, tablename FROM pg_policies WHERE schemaname = 'public' LOOP
    EXECUTE format('DROP POLICY %I ON %I', p.policyname, p.tablename);
  END LOOP;
END $$;

DO $$
DECLARE m record;
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'fitapp_superadmin') THEN
    FOR m IN SELECT r.rolname FROM pg_auth_members am
             JOIN pg_roles r ON r.oid = am.member
             JOIN pg_roles g ON g.oid = am.roleid
             WHERE g.rolname = 'fitapp_superadmin' LOOP
      EXECUTE format('REVOKE fitapp_superadmin FROM %I', m.rolname);
    END LOOP;
    DROP ROLE fitapp_superadmin;
  END IF;
END $$;

-- ── Funciones de contexto ────────────────────────────────────────────────────
-- DROP antes de CREATE: algunas bases tienen una versión anterior que devolvía uuid
DROP FUNCTION IF EXISTS current_gym_id();
DROP FUNCTION IF EXISTS current_app_user_id();
DROP FUNCTION IF EXISTS app_rls_bypass();
CREATE OR REPLACE FUNCTION current_gym_id() RETURNS text AS $$
  SELECT NULLIF(current_setting('app.current_gym_id', TRUE), '');
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION current_app_user_id() RETURNS text AS $$
  SELECT NULLIF(current_setting('app.current_user_id', TRUE), '');
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION app_rls_bypass() RETURNS boolean AS $$
  SELECT COALESCE(current_setting('app.bypass_rls', TRUE), '') = 'on';
$$ LANGUAGE sql STABLE;

-- ── Tablas con gymId propio ─────────────────────────────────────────────────
ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "User" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "User"
  USING (app_rls_bypass() OR "gymId" = current_gym_id() OR "id" = current_app_user_id())
  WITH CHECK (app_rls_bypass() OR "gymId" = current_gym_id() OR "id" = current_app_user_id());

ALTER TABLE "Plan" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Plan" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Plan"
  USING (app_rls_bypass() OR "gymId" = current_gym_id())
  WITH CHECK (app_rls_bypass() OR "gymId" = current_gym_id());

ALTER TABLE "ClassType" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ClassType" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "ClassType"
  USING (app_rls_bypass() OR "gymId" = current_gym_id())
  WITH CHECK (app_rls_bypass() OR "gymId" = current_gym_id());

ALTER TABLE "Class" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Class" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Class"
  USING (app_rls_bypass() OR "gymId" = current_gym_id())
  WITH CHECK (app_rls_bypass() OR "gymId" = current_gym_id());

ALTER TABLE "Wod" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Wod" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Wod"
  USING (app_rls_bypass() OR "gymId" = current_gym_id())
  WITH CHECK (app_rls_bypass() OR "gymId" = current_gym_id());

ALTER TABLE "GymSkill" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "GymSkill" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "GymSkill"
  USING (app_rls_bypass() OR "gymId" = current_gym_id())
  WITH CHECK (app_rls_bypass() OR "gymId" = current_gym_id());

ALTER TABLE "GymSubscription" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "GymSubscription" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "GymSubscription"
  USING (app_rls_bypass() OR "gymId" = current_gym_id())
  WITH CHECK (app_rls_bypass() OR "gymId" = current_gym_id());

ALTER TABLE "GymSubscriptionPayment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "GymSubscriptionPayment" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "GymSubscriptionPayment"
  USING (app_rls_bypass() OR "gymId" = current_gym_id())
  WITH CHECK (app_rls_bypass() OR "gymId" = current_gym_id());

ALTER TABLE "BenchmarkResult" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BenchmarkResult" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "BenchmarkResult"
  USING (app_rls_bypass() OR "gymId" = current_gym_id())
  WITH CHECK (app_rls_bypass() OR "gymId" = current_gym_id());

ALTER TABLE "FintocLink" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FintocLink" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "FintocLink"
  USING (app_rls_bypass() OR "gymId" = current_gym_id())
  WITH CHECK (app_rls_bypass() OR "gymId" = current_gym_id());

ALTER TABLE "BankMovement" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BankMovement" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "BankMovement"
  USING (app_rls_bypass() OR "gymId" = current_gym_id())
  WITH CHECK (app_rls_bypass() OR "gymId" = current_gym_id());

ALTER TABLE "WodResult" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "WodResult" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "WodResult"
  USING (app_rls_bypass() OR "gymId" = current_gym_id())
  WITH CHECK (app_rls_bypass() OR "gymId" = current_gym_id());

ALTER TABLE "FintocPaymentIntent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FintocPaymentIntent" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "FintocPaymentIntent"
  USING (app_rls_bypass() OR "gymId" = current_gym_id())
  WITH CHECK (app_rls_bypass() OR "gymId" = current_gym_id());

-- Benchmarks oficiales (gymId NULL) son visibles para todos; solo el sistema los crea
ALTER TABLE "Benchmark" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Benchmark" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Benchmark"
  USING (app_rls_bypass() OR "gymId" IS NULL OR "gymId" = current_gym_id())
  WITH CHECK (app_rls_bypass() OR "gymId" = current_gym_id());

-- ── Tablas hijas: visibles si su fila padre es visible (el EXISTS aplica la RLS del padre)
ALTER TABLE "Membership" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Membership" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Membership"
  USING (app_rls_bypass() OR EXISTS (SELECT 1 FROM "User" p WHERE p."id" = "Membership"."userId"))
  WITH CHECK (app_rls_bypass() OR EXISTS (SELECT 1 FROM "User" p WHERE p."id" = "Membership"."userId"));

ALTER TABLE "RmRecord" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RmRecord" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "RmRecord"
  USING (app_rls_bypass() OR EXISTS (SELECT 1 FROM "User" p WHERE p."id" = "RmRecord"."userId"))
  WITH CHECK (app_rls_bypass() OR EXISTS (SELECT 1 FROM "User" p WHERE p."id" = "RmRecord"."userId"));

ALTER TABLE "GymnasticProgress" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "GymnasticProgress" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "GymnasticProgress"
  USING (app_rls_bypass() OR EXISTS (SELECT 1 FROM "User" p WHERE p."id" = "GymnasticProgress"."userId"))
  WITH CHECK (app_rls_bypass() OR EXISTS (SELECT 1 FROM "User" p WHERE p."id" = "GymnasticProgress"."userId"));

ALTER TABLE "RefreshToken" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RefreshToken" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "RefreshToken"
  USING (app_rls_bypass() OR EXISTS (SELECT 1 FROM "User" p WHERE p."id" = "RefreshToken"."userId"))
  WITH CHECK (app_rls_bypass() OR EXISTS (SELECT 1 FROM "User" p WHERE p."id" = "RefreshToken"."userId"));

ALTER TABLE "PasswordResetToken" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PasswordResetToken" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "PasswordResetToken"
  USING (app_rls_bypass() OR EXISTS (SELECT 1 FROM "User" p WHERE p."id" = "PasswordResetToken"."userId"))
  WITH CHECK (app_rls_bypass() OR EXISTS (SELECT 1 FROM "User" p WHERE p."id" = "PasswordResetToken"."userId"));

ALTER TABLE "Booking" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Booking" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Booking"
  USING (app_rls_bypass() OR EXISTS (SELECT 1 FROM "Class" p WHERE p."id" = "Booking"."classId"))
  WITH CHECK (app_rls_bypass() OR EXISTS (SELECT 1 FROM "Class" p WHERE p."id" = "Booking"."classId"));

ALTER TABLE "ClassTypeBlock" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ClassTypeBlock" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "ClassTypeBlock"
  USING (app_rls_bypass() OR EXISTS (SELECT 1 FROM "ClassType" p WHERE p."id" = "ClassTypeBlock"."classTypeId"))
  WITH CHECK (app_rls_bypass() OR EXISTS (SELECT 1 FROM "ClassType" p WHERE p."id" = "ClassTypeBlock"."classTypeId"));

ALTER TABLE "WodBlock" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "WodBlock" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "WodBlock"
  USING (app_rls_bypass() OR EXISTS (SELECT 1 FROM "Wod" p WHERE p."id" = "WodBlock"."wodId"))
  WITH CHECK (app_rls_bypass() OR EXISTS (SELECT 1 FROM "Wod" p WHERE p."id" = "WodBlock"."wodId"));

ALTER TABLE "WodMovement" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "WodMovement" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "WodMovement"
  USING (app_rls_bypass() OR EXISTS (SELECT 1 FROM "WodBlock" p WHERE p."id" = "WodMovement"."blockId"))
  WITH CHECK (app_rls_bypass() OR EXISTS (SELECT 1 FROM "WodBlock" p WHERE p."id" = "WodMovement"."blockId"));

ALTER TABLE "GymSkillMilestone" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "GymSkillMilestone" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "GymSkillMilestone"
  USING (app_rls_bypass() OR EXISTS (SELECT 1 FROM "GymSkill" p WHERE p."id" = "GymSkillMilestone"."skillId"))
  WITH CHECK (app_rls_bypass() OR EXISTS (SELECT 1 FROM "GymSkill" p WHERE p."id" = "GymSkillMilestone"."skillId"));

ALTER TABLE "BenchmarkMovement" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BenchmarkMovement" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "BenchmarkMovement"
  USING (app_rls_bypass() OR EXISTS (SELECT 1 FROM "Benchmark" p WHERE p."id" = "BenchmarkMovement"."benchmarkId"))
  WITH CHECK (app_rls_bypass() OR EXISTS (SELECT 1 FROM "Benchmark" p WHERE p."id" = "BenchmarkMovement"."benchmarkId"));

-- ── Rol de la aplicación: sin superusuario ni bypass de RLS ──────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'fitapp_app') THEN
    CREATE ROLE fitapp_app NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO fitapp_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO fitapp_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO fitapp_app;
REVOKE ALL ON TABLE "_prisma_migrations" FROM fitapp_app;
-- Tablas que creen migraciones futuras (las ejecuta el usuario admin)
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO fitapp_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO fitapp_app;
