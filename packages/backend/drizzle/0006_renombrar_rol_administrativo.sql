-- El rol `administrativo` pasa a llamarse `escritura_lectura`.
--
-- Quedaba pegado a `administrador` (el rol de acceso total) y en castellano
-- rioplatense los dos se leen casi igual, pero significan cosas opuestas: uno
-- gestiona usuarios y puede borrar la empresa, el otro carga comprobantes. El
-- nombre nuevo dice la capacidad en lugar del puesto.
--
-- Los permisos no cambian: es el mismo rol con otro nombre.
UPDATE member SET role = 'escritura_lectura' WHERE role = 'administrativo';
--> statement-breakpoint
UPDATE invitation SET role = 'escritura_lectura' WHERE role = 'administrativo';
