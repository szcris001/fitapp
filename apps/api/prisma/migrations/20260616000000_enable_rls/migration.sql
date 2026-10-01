-- Reemplazada por 20260927010000_rls_enforced.
--
-- El GRANT fitapp_superadmin TO fitapp asumía que el rol admin de Postgres se llama
-- "fitapp" (así lo configuramos en docker-compose y en CI). En un Postgres gestionado
-- (Railway, RDS...) el superusuario tiene otro nombre (p. ej. "postgres"), así que esta
-- migración fallaba con "role fitapp does not exist" en cualquier deploy nuevo fuera de
-- esos dos entornos. Se deja vacía para no romper el historial de migraciones.
SELECT 1;
