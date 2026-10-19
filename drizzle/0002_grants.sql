-- Least Privilege: die App-Rolle darf Daten lesen und schreiben, aber kein DDL.
-- Neue Tabellen bekommen ihre Rechte bewusst in ihrer eigenen Migration.
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO rt100k_app;
--> statement-breakpoint
-- Auth (Better Auth verwaltet Sessions, Passkeys, Verifizierungen selbst)
GRANT SELECT, INSERT, UPDATE, DELETE ON "user", "session", "account", "verification", "two_factor", "passkey", "rate_limit" TO rt100k_app;
--> statement-breakpoint
-- Einladungen: werden widerrufen oder verbraucht, nie gelöscht
GRANT SELECT, INSERT, UPDATE ON "invitation" TO rt100k_app;
--> statement-breakpoint
-- Audit-Log: anhängen und eigene Einträge lesen; Löschen nur abgelaufener Einträge (Policy)
GRANT SELECT, INSERT, DELETE ON "audit_event" TO rt100k_app;
--> statement-breakpoint
-- Nutzerdaten (zusätzlich durch Row Level Security beschränkt)
GRANT SELECT, INSERT, UPDATE, DELETE ON "portfolio", "instrument", "booking", "portfolio_snapshot", "road_settings" TO rt100k_app;
--> statement-breakpoint
-- Allgemeine Kursdaten
GRANT SELECT, INSERT, UPDATE ON "price_daily", "fx_daily" TO rt100k_app;
