-- Consultas para leer lo que la gente le pregunta al asistente.
--
-- Se corren con el rol de migraciones (dueño del schema), que no pasa por RLS:
-- son para nosotros, los operadores, no para la aplicación. Desde el backend
-- estos datos solo se leen con `app.tenant_id` puesto.
--
--   psql "$DATABASE_URL_MIGRATIONS" -f scripts/leer-conversaciones.sql
--
-- El objetivo es decidir con datos, no de memoria: qué partes del manual están
-- flojas y qué herramientas necesita la Fase B.

\echo '=== Últimas preguntas ==='
select
  m.creado::timestamp(0) as cuando,
  o.name                 as empresa,
  m.contenido            as pregunta
from asistente_mensajes m
join organization o on o.id = m.tenant_id
where m.rol = 'user'
order by m.creado desc
limit 50;

\echo ''
\echo '=== Preguntas que el asistente no supo contestar ==='
-- Heurística, no verdad revelada: son las respuestas donde admitió no tener
-- algo documentado o no poder ver los datos. Cada una es candidata a mejorar
-- el manual (si es de uso) o a una herramienta de Fase B (si es de datos).
select
  m.creado::timestamp(0) as cuando,
  lag(m.contenido) over (partition by m.conversacion_id order by m.creado) as pregunta,
  left(m.contenido, 120) as respuesta
from asistente_mensajes m
where m.rol = 'assistant'
  and (m.contenido ilike '%no tengo documentad%'
    or m.contenido ilike '%no puedo ver%'
    or m.contenido ilike '%no tengo acceso%')
order by m.creado desc
limit 30;

\echo ''
\echo '=== Conversaciones por empresa ==='
select
  o.name                                    as empresa,
  count(distinct c.id)                      as conversaciones,
  count(m.id) filter (where m.rol = 'user') as preguntas,
  max(c.ultimo_mensaje)::timestamp(0)       as ultima_vez
from asistente_conversaciones c
join organization o on o.id = c.tenant_id
left join asistente_mensajes m on m.conversacion_id = c.id
group by o.name
order by preguntas desc;

\echo ''
\echo '=== Consumo de tokens por día ==='
-- `cache` alto respecto de `entrada` es lo esperado a partir del segundo
-- mensaje de cada conversación. Si se queda en cero siempre, el prefijo dejó
-- de ser estable y el prompt hay que revisarlo.
select
  m.creado::date            as dia,
  count(*)                  as respuestas,
  sum(m.tokens_entrada)     as entrada,
  sum(m.tokens_cache)       as cache,
  sum(m.tokens_salida)      as salida
from asistente_mensajes m
where m.rol = 'assistant'
group by dia
order by dia desc
limit 30;
