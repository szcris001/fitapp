-- Conecta un Wod con el Benchmark del catálogo del que se originó (el coach lo
-- aplicó desde el editor de WOD vía "applyBenchmark"). Nullable: la mayoría de
-- los WODs no vienen de un benchmark.
--
-- ON DELETE SET NULL (no Cascade ni Restrict): si se borra un benchmark custom
-- del gym, los WODs ya planificados a partir de él -y los WodResult de los
-- alumnos que ya lo corrieron- no deben desaparecer ni bloquear el borrado del
-- benchmark. Esa historia ya pasó a ser del alumno (WodResult), no del
-- benchmark. No requiere cambios de RLS: la policy tenant_isolation de "Wod"
-- ya filtra por "gymId" = current_gym_id() sin importar esta columna nueva
-- (ver 20260927010000_rls_enforced).
-- AlterTable
ALTER TABLE "Wod" ADD COLUMN     "benchmarkId" TEXT;

-- CreateIndex
CREATE INDEX "Wod_benchmarkId_idx" ON "Wod"("benchmarkId");

-- Soporta la consulta de "historial de progreso" del alumno (GET /wod-results/me
-- y el include nuevo en GET /users/:id), que hoy filtra WodResult por
-- userId+gymId sin índice dedicado.
-- CreateIndex
CREATE INDEX "WodResult_gymId_userId_idx" ON "WodResult"("gymId", "userId");

-- AddForeignKey
ALTER TABLE "Wod" ADD CONSTRAINT "Wod_benchmarkId_fkey" FOREIGN KEY ("benchmarkId") REFERENCES "Benchmark"("id") ON DELETE SET NULL ON UPDATE CASCADE;
