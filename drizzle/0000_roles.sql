-- App-Rolle (ohne DDL-Rechte). Ohne Login angelegt; Passwort und LOGIN setzt
-- der Betreiber außerhalb des Repos: ALTER ROLE rt100k_app LOGIN PASSWORD '…';
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'rt100k_app') THEN
    CREATE ROLE rt100k_app NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
  END IF;
END
$$;
--> statement-breakpoint
-- Nutzer der laufenden Transaktion (gesetzt per set_config('app.user_id', …, true)).
-- Leer oder nicht gesetzt → NULL → jede Row-Level-Policy schlägt fehl (deny by default).
CREATE OR REPLACE FUNCTION app_user_id() RETURNS text
  LANGUAGE sql STABLE PARALLEL SAFE
  AS $$ SELECT nullif(current_setting('app.user_id', true), '') $$;
