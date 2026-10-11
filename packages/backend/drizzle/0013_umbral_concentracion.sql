-- Umbral de concentración por empresa.
--
-- Qué porcentaje del total por cobrar puede representar un solo cliente antes
-- de que la pantalla lo marque como riesgo. Vive en `parametros` y no en el
-- código porque es un criterio de negocio: cada PyME tolera una concentración
-- distinta según su rubro.
--
-- Va con default y NOT NULL, a diferencia de `margen_objetivo` y
-- `minimo_operativo`, que son nulos a propósito: sin umbral no hay semáforo
-- que pintar, y 20% es el criterio con el que arranca.
ALTER TABLE "parametros"
  ADD COLUMN IF NOT EXISTS "umbral_concentracion" numeric(5, 2) DEFAULT '20' NOT NULL;
