-- Reemplazada por 20260927010000_rls_enforced.
--
-- La versión original de esta migración nunca pudo aplicarse (fallaba con
-- "operator does not exist: text = uuid" al comparar current_gym_id() con columnas
-- uuid) y además repetía la cláusula `OR pg_has_role(current_user, 'fitapp_superadmin')`
-- que anulaba RLS. Se deja vacía para no romper el historial de migraciones.
SELECT 1;
