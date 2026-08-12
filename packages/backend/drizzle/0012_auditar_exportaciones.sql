-- Exportar no modifica nada, pero llevarse el padrón completo de clientes con
-- CUITs y datos de contacto es exactamente el movimiento que uno quiere poder
-- reconstruir después. Por eso es una acción auditada más.
ALTER TYPE "public"."accion_auditoria" ADD VALUE IF NOT EXISTS 'exportacion';
