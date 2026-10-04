-- Habilita el borrado permanente de un Gym (DELETE /superadmin/gyms/:id/permanent).
-- Las FKs listadas abajo eran RESTRICT (o SET NULL para las opcionales
-- User.gymId y Benchmark.gymId) por default de Prisma, así que `prisma.gym.delete`
-- siempre fallaba con una violación de FK en cuanto el gym tenía al menos un
-- User/Plan/ClassType/etc. Se cambian a CASCADE para que borrar un Gym borre en
-- cascada todos sus datos (lo que el modal de confirmación de la UI ya promete).
--
-- Caso "diamante": tablas sin gymId propio (Booking, RmRecord, GymnasticProgress,
-- Membership) pasan a cascadear vía su FK a User/Plan/Class, ya que su fila
-- desaparece cuando el User/Plan/Class del que dependen se borra. No se toca
-- Class.coachId, Class.classTypeId, Wod.classTypeId, WodResult.userId/recordedBy
-- ni BankMovement.fintocLinkId/membershipId: esas tablas ya desaparecen por su
-- propio camino directo (o vía User/Plan) hacia Gym dentro de la misma operación
-- de DELETE, así que Postgres nunca llega a validar esas FKs contra una fila viva.
--
-- No se tocan RLS policies: este cambio es solo de FKs (DROP/ADD CONSTRAINT), no
-- agrega tablas ni cambia ENABLE/FORCE ROW LEVEL SECURITY.

-- DropForeignKey
ALTER TABLE "BankMovement" DROP CONSTRAINT "BankMovement_gymId_fkey";

-- DropForeignKey
ALTER TABLE "Benchmark" DROP CONSTRAINT "Benchmark_gymId_fkey";

-- DropForeignKey
ALTER TABLE "Booking" DROP CONSTRAINT "Booking_classId_fkey";

-- DropForeignKey
ALTER TABLE "Booking" DROP CONSTRAINT "Booking_userId_fkey";

-- DropForeignKey
ALTER TABLE "Class" DROP CONSTRAINT "Class_gymId_fkey";

-- DropForeignKey
ALTER TABLE "ClassType" DROP CONSTRAINT "ClassType_gymId_fkey";

-- DropForeignKey
ALTER TABLE "FintocLink" DROP CONSTRAINT "FintocLink_gymId_fkey";

-- DropForeignKey
ALTER TABLE "FintocPaymentIntent" DROP CONSTRAINT "FintocPaymentIntent_gymId_fkey";

-- DropForeignKey
ALTER TABLE "GymSkill" DROP CONSTRAINT "GymSkill_gymId_fkey";

-- DropForeignKey
ALTER TABLE "GymSubscription" DROP CONSTRAINT "GymSubscription_gymId_fkey";

-- DropForeignKey
ALTER TABLE "GymSubscriptionPayment" DROP CONSTRAINT "GymSubscriptionPayment_gymId_fkey";

-- DropForeignKey
ALTER TABLE "GymnasticProgress" DROP CONSTRAINT "GymnasticProgress_userId_fkey";

-- DropForeignKey
ALTER TABLE "Membership" DROP CONSTRAINT "Membership_planId_fkey";

-- DropForeignKey
ALTER TABLE "Membership" DROP CONSTRAINT "Membership_userId_fkey";

-- DropForeignKey
ALTER TABLE "Plan" DROP CONSTRAINT "Plan_gymId_fkey";

-- DropForeignKey
ALTER TABLE "RmRecord" DROP CONSTRAINT "RmRecord_userId_fkey";

-- DropForeignKey
ALTER TABLE "User" DROP CONSTRAINT "User_gymId_fkey";

-- DropForeignKey
ALTER TABLE "Wod" DROP CONSTRAINT "Wod_gymId_fkey";

-- DropForeignKey
ALTER TABLE "WodResult" DROP CONSTRAINT "WodResult_gymId_fkey";

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_gymId_fkey" FOREIGN KEY ("gymId") REFERENCES "Gym"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Plan" ADD CONSTRAINT "Plan_gymId_fkey" FOREIGN KEY ("gymId") REFERENCES "Gym"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassType" ADD CONSTRAINT "ClassType_gymId_fkey" FOREIGN KEY ("gymId") REFERENCES "Gym"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Class" ADD CONSTRAINT "Class_gymId_fkey" FOREIGN KEY ("gymId") REFERENCES "Gym"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Wod" ADD CONSTRAINT "Wod_gymId_fkey" FOREIGN KEY ("gymId") REFERENCES "Gym"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RmRecord" ADD CONSTRAINT "RmRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GymnasticProgress" ADD CONSTRAINT "GymnasticProgress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GymSkill" ADD CONSTRAINT "GymSkill_gymId_fkey" FOREIGN KEY ("gymId") REFERENCES "Gym"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GymSubscription" ADD CONSTRAINT "GymSubscription_gymId_fkey" FOREIGN KEY ("gymId") REFERENCES "Gym"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GymSubscriptionPayment" ADD CONSTRAINT "GymSubscriptionPayment_gymId_fkey" FOREIGN KEY ("gymId") REFERENCES "Gym"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Benchmark" ADD CONSTRAINT "Benchmark_gymId_fkey" FOREIGN KEY ("gymId") REFERENCES "Gym"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FintocLink" ADD CONSTRAINT "FintocLink_gymId_fkey" FOREIGN KEY ("gymId") REFERENCES "Gym"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankMovement" ADD CONSTRAINT "BankMovement_gymId_fkey" FOREIGN KEY ("gymId") REFERENCES "Gym"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WodResult" ADD CONSTRAINT "WodResult_gymId_fkey" FOREIGN KEY ("gymId") REFERENCES "Gym"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FintocPaymentIntent" ADD CONSTRAINT "FintocPaymentIntent_gymId_fkey" FOREIGN KEY ("gymId") REFERENCES "Gym"("id") ON DELETE CASCADE ON UPDATE CASCADE;
