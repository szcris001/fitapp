-- Clasifica cada bloque de un Wod por fase de la clase, siguiendo la
-- estructura oficial de CrossFit (CrossFit.com / CrossFit Journal):
-- calentamiento -> habilidad/fuerza (un solo tipo combinado) -> WOD ->
-- vuelta a la calma. La pizarra/briefing no se guarda, no es un bloque.
--
-- Los bloques son opcionales y libres: el coach arma los que quiera ese día
-- (a veces solo WOD, a veces los 4). El tipo clasifica, no obliga, por eso
-- el default es OTHER y no hay NOT NULL sin default: cubre tanto los
-- ~cientos de WodBlock existentes (todos sin tipo hoy) como los bloques
-- nuevos que el coach deje sin elegir.
--
-- No requiere cambios de RLS: la policy tenant_isolation de "WodBlock" ya
-- filtra vía EXISTS contra "Wod" (no depende de columnas propias de
-- WodBlock), ver 20260927010000_rls_enforced.

-- CreateEnum
CREATE TYPE "WodBlockType" AS ENUM ('WARMUP', 'SKILL_STRENGTH', 'WOD', 'COOLDOWN', 'OTHER');

-- AlterTable
ALTER TABLE "WodBlock" ADD COLUMN     "type" "WodBlockType" NOT NULL DEFAULT 'OTHER';
