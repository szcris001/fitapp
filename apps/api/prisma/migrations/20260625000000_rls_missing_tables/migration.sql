-- ============================================================
-- RLS — Tablas tenant-scoped faltantes
-- ============================================================
-- La migración 20260616000000_enable_rls cubrió las tablas principales.
-- Esta migración añade RLS a las tablas que quedaron sin protección:
-- Membership, Booking, RmRecord, GymnasticProgress, GymSkillMilestone,
-- WodBlock, WodMovement, BenchmarkResult.
--
-- Algunas de estas tablas no tienen gymId directo: se protegen mediante
-- una policy que verifica el gymId del registro padre mediante join.
-- ============================================================

-- ── Tabla: "Membership" ───────────────────────────────────────────────────────
-- Tiene userId → User.gymId. La policy verifica via subquery.
ALTER TABLE "Membership" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Membership" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS membership_gym_isolation ON "Membership";
CREATE POLICY membership_gym_isolation ON "Membership"
  USING (
    EXISTS (
      SELECT 1 FROM "User" u
      WHERE u.id = "Membership"."userId"
        AND u."gymId" = current_gym_id()
    )
    OR current_setting('app.bypass_rls', TRUE) = 'true'
    OR pg_has_role(current_user, 'fitapp_superadmin', 'member')
  );

-- ── Tabla: "Booking" ──────────────────────────────────────────────────────────
-- Tiene classId → Class.gymId. La policy verifica via subquery.
ALTER TABLE "Booking" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Booking" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS booking_gym_isolation ON "Booking";
CREATE POLICY booking_gym_isolation ON "Booking"
  USING (
    EXISTS (
      SELECT 1 FROM "Class" c
      WHERE c.id = "Booking"."classId"
        AND c."gymId" = current_gym_id()
    )
    OR current_setting('app.bypass_rls', TRUE) = 'true'
    OR pg_has_role(current_user, 'fitapp_superadmin', 'member')
  );

-- ── Tabla: "RmRecord" ─────────────────────────────────────────────────────────
-- Tiene userId → User.gymId.
ALTER TABLE "RmRecord" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RmRecord" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rmrecord_gym_isolation ON "RmRecord";
CREATE POLICY rmrecord_gym_isolation ON "RmRecord"
  USING (
    EXISTS (
      SELECT 1 FROM "User" u
      WHERE u.id = "RmRecord"."userId"
        AND u."gymId" = current_gym_id()
    )
    OR current_setting('app.bypass_rls', TRUE) = 'true'
    OR pg_has_role(current_user, 'fitapp_superadmin', 'member')
  );

-- ── Tabla: "GymnasticProgress" ────────────────────────────────────────────────
-- Tiene userId → User.gymId.
ALTER TABLE "GymnasticProgress" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "GymnasticProgress" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS gymnasticprogress_gym_isolation ON "GymnasticProgress";
CREATE POLICY gymnasticprogress_gym_isolation ON "GymnasticProgress"
  USING (
    EXISTS (
      SELECT 1 FROM "User" u
      WHERE u.id = "GymnasticProgress"."userId"
        AND u."gymId" = current_gym_id()
    )
    OR current_setting('app.bypass_rls', TRUE) = 'true'
    OR pg_has_role(current_user, 'fitapp_superadmin', 'member')
  );

-- ── Tabla: "GymSkillMilestone" ────────────────────────────────────────────────
-- Tiene skillId → GymSkill.gymId.
ALTER TABLE "GymSkillMilestone" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "GymSkillMilestone" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS gymskillmilestone_gym_isolation ON "GymSkillMilestone";
CREATE POLICY gymskillmilestone_gym_isolation ON "GymSkillMilestone"
  USING (
    EXISTS (
      SELECT 1 FROM "GymSkill" gs
      WHERE gs.id = "GymSkillMilestone"."skillId"
        AND gs."gymId" = current_gym_id()
    )
    OR current_setting('app.bypass_rls', TRUE) = 'true'
    OR pg_has_role(current_user, 'fitapp_superadmin', 'member')
  );

-- ── Tabla: "WodBlock" ─────────────────────────────────────────────────────────
-- Tiene wodId → Wod.gymId.
ALTER TABLE "WodBlock" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "WodBlock" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS wodblock_gym_isolation ON "WodBlock";
CREATE POLICY wodblock_gym_isolation ON "WodBlock"
  USING (
    EXISTS (
      SELECT 1 FROM "Wod" w
      WHERE w.id = "WodBlock"."wodId"
        AND w."gymId" = current_gym_id()
    )
    OR current_setting('app.bypass_rls', TRUE) = 'true'
    OR pg_has_role(current_user, 'fitapp_superadmin', 'member')
  );

-- ── Tabla: "WodMovement" ──────────────────────────────────────────────────────
-- Tiene blockId → WodBlock → Wod.gymId (dos saltos).
-- Simplificamos verificando que el blockId pertenece a un Wod del gym.
ALTER TABLE "WodMovement" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "WodMovement" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS wodmovement_gym_isolation ON "WodMovement";
CREATE POLICY wodmovement_gym_isolation ON "WodMovement"
  USING (
    EXISTS (
      SELECT 1 FROM "WodBlock" wb
        JOIN "Wod" w ON w.id = wb."wodId"
      WHERE wb.id = "WodMovement"."blockId"
        AND w."gymId" = current_gym_id()
    )
    OR current_setting('app.bypass_rls', TRUE) = 'true'
    OR pg_has_role(current_user, 'fitapp_superadmin', 'member')
  );

-- ── Tabla: "BenchmarkResult" ──────────────────────────────────────────────────
-- Tiene gymId directo.
ALTER TABLE "BenchmarkResult" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BenchmarkResult" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS benchmarkresult_gym_isolation ON "BenchmarkResult";
CREATE POLICY benchmarkresult_gym_isolation ON "BenchmarkResult"
  USING (
    "gymId" = current_gym_id()
    OR current_setting('app.bypass_rls', TRUE) = 'true'
    OR pg_has_role(current_user, 'fitapp_superadmin', 'member')
  );
