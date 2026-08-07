-- El rol `contador` tenía exactamente los mismos permisos que `solo_lectura`:
-- leía todo el ERP y no escribía nada. Dos nombres para la misma capacidad solo
-- confunden a quien invita, así que queda uno.
--
-- Un contador externo sigue siendo un caso central del producto (un mismo mail
-- en varias organizaciones); lo que cambia es que entra como `solo_lectura`.
--
-- `member.role` e `invitation.role` son columnas de texto libre de BetterAuth,
-- así que alcanza con reasignar las filas: no hay enum que alterar.
UPDATE member SET role = 'solo_lectura' WHERE role = 'contador';
--> statement-breakpoint
UPDATE invitation SET role = 'solo_lectura' WHERE role = 'contador';
