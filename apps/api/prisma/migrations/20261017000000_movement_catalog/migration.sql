-- CreateTable
CREATE TABLE "Movement" (
    "id" TEXT NOT NULL,
    "externalId" TEXT,
    "gymId" TEXT,
    "nombre" TEXT NOT NULL,
    "categoria" TEXT NOT NULL,
    "isOfficial" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Movement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Movement_externalId_key" ON "Movement"("externalId");

-- AddForeignKey
ALTER TABLE "Movement" ADD CONSTRAINT "Movement_gymId_fkey" FOREIGN KEY ("gymId") REFERENCES "Gym"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Movimientos oficiales (gymId NULL) visibles para todos los gyms; solo el sistema
-- los crea (bypass de RLS) — mismo patrón que "Benchmark" en 20260927010000_rls_enforced.
ALTER TABLE "Movement" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Movement" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Movement"
  USING (app_rls_bypass() OR "gymId" IS NULL OR "gymId" = current_gym_id())
  WITH CHECK (app_rls_bypass() OR "gymId" = current_gym_id());

-- Migra los movimientos custom existentes (Gym.movementLibrary, JSON con items
-- {name, cat} o strings sueltos) a filas Movement (gymId=ese gym, isOfficial=false),
-- antes de borrar la columna. El seed (prisma/seed.ts) siembra por separado los
-- movimientos oficiales (gymId NULL, isOfficial=true).
INSERT INTO "Movement" ("id", "gymId", "nombre", "categoria", "isOfficial", "createdAt")
SELECT
  gen_random_uuid()::text,
  g.id,
  COALESCE(elem->>'name', elem #>> '{}'),
  COALESCE(elem->>'cat', 'Personalizado'),
  false,
  now()
FROM "Gym" g, jsonb_array_elements(g."movementLibrary") AS elem
WHERE jsonb_typeof(g."movementLibrary") = 'array'
  AND jsonb_array_length(g."movementLibrary") > 0
  AND trim(COALESCE(elem->>'name', elem #>> '{}', '')) <> '';

-- AlterTable
ALTER TABLE "Gym" DROP COLUMN "movementLibrary";
