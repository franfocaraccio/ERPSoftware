---
description: Estado de la base local — contenedor, migraciones aplicadas y cómo regenerarla
---

1. Verificá que el contenedor `erp-postgres` esté corriendo (`docker compose ps`); si no, levantalo con `docker compose up -d` y esperá el healthcheck.
2. Reportá qué migraciones de Drizzle hay en el repo y cuáles están aplicadas en la base local.
3. Si el usuario lo pide explícitamente, regenerá la base local: bajar el contenedor con `docker compose down -v` (avisá que borra los datos locales), levantarlo de nuevo y aplicar todas las migraciones. Nunca hagas esto sin pedido explícito.
