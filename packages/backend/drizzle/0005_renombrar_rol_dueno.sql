-- El rol `dueno` pasa a llamarse `administrador`.
--
-- El motivo es de producto, no técnico: "dueño" sugiere que hay uno solo y que
-- es el titular de la empresa. La capacidad que describe es otra —acceso total,
-- incluida la gestión de usuarios— y quien la tiene puede ser gente de
-- confianza además del titular. Con el nombre viejo, sumar un segundo se leía
-- como ceder la empresa.
--
-- Los permisos no cambian: es el mismo rol con otro nombre.
UPDATE member SET role = 'administrador' WHERE role = 'dueno';
--> statement-breakpoint
UPDATE invitation SET role = 'administrador' WHERE role = 'dueno';
