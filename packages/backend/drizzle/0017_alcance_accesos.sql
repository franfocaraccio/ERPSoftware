-- Etapa 5 del análisis: alcance por módulo de los links de solo lectura.
-- Null = todos los módulos, que es lo que veían los links existentes.
ALTER TABLE "accesos_consolidado" ADD COLUMN IF NOT EXISTS "modulos" text[];
