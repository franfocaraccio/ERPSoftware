-- Cierra el acceso de la Data API de Supabase (PostgREST) a las tablas de
-- BetterAuth.
--
-- Esas ocho tablas no llevan RLS a propósito: el backend legítimamente las lee
-- y las escribe con erp_app, y RLS sin políticas lo dejaría afuera —nadie
-- podría iniciar sesión—. Lo que hay que impedir es otra cosa: que queden
-- alcanzables desde la API HTTP que Supabase expone sobre el schema public y
-- que se consulta con los roles `anon` y `authenticated`. La clave de `anon` es
-- pública por diseño, así que un GRANT ahí significa tokens de sesión y hashes
-- de contraseña legibles por HTTPS. Con un token de sesión no hace falta la
-- contraseña: se entra directo.
--
-- Hoy la Data API está desactivada en erp-dev, pero esa protección vive en un
-- checkbox del dashboard. Esto la mueve al repositorio, donde viaja sola a cada
-- entorno nuevo y no depende de que alguien se acuerde.
--
-- Los roles `anon` y `authenticated` los crea la plataforma Supabase y NO
-- existen en el Postgres de docker-compose ni en el del CI, por eso todo va
-- adentro de un chequeo de existencia en lugar de sentencias sueltas.
DO $$
DECLARE
  rol text;
  tabla text;
  tablas_auth text[] := ARRAY[
    'user', 'session', 'account', 'verification',
    'organization', 'member', 'invitation', 'two_factor'
  ];
BEGIN
  FOREACH rol IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = rol) THEN
      RAISE NOTICE 'El rol % no existe (Postgres local o CI): nada que revocar.', rol;
      CONTINUE;
    END IF;

    FOREACH tabla IN ARRAY tablas_auth LOOP
      EXECUTE format('REVOKE ALL ON TABLE public.%I FROM %I', tabla, rol);
    END LOOP;

    -- Y que las tablas futuras nazcan sin permisos para estos roles. Aplica a
    -- las que cree el rol que corre las migraciones, que es el mismo que crea
    -- todo el schema. Vale para las de negocio también: ninguna tabla de este
    -- proyecto se accede desde la Data API, el frontend nunca usa supabase-js.
    EXECUTE format(
      'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM %I', rol
    );
  END LOOP;
END
$$;
