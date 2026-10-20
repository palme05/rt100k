-- Freigaben: der Besitzer legt Links an, sieht und widerruft sie; der Empfänger
-- sieht angenommene Freigaben und kann sie verlassen. Kein UPDATE für die App –
-- Annehmen geht nur über accept_portfolio_share().
GRANT SELECT, INSERT, DELETE ON "portfolio_share" TO rt100k_app;
--> statement-breakpoint
-- Vorschau eines gültigen Links (Depot- und Besitzername), bevor der Empfänger
-- die Zeile sehen darf. SECURITY DEFINER mit festem search_path; nur für
-- angemeldete Nutzer (app_user_id() gesetzt), nicht für den Besitzer selbst.
CREATE OR REPLACE FUNCTION peek_portfolio_share(p_token_hash text)
  RETURNS TABLE (portfolio_name text, owner_name text, expires_at timestamptz)
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
    SELECT p.name, u.name, s.expires_at
      FROM portfolio_share s
      JOIN portfolio p ON p.id = s.portfolio_id AND p.owner_id = s.owner_id
      JOIN "user" u ON u.id = s.owner_id
     WHERE app_user_id() IS NOT NULL
       AND s.token_hash = p_token_hash
       AND s.grantee_id IS NULL
       AND s.expires_at > now()
       AND s.owner_id <> app_user_id()
  $$;
--> statement-breakpoint
-- Link einlösen: einmalig, nur gültige Links, nicht das eigene Depot, keine
-- doppelte Freigabe. Liefert die Depot-ID oder NULL.
CREATE OR REPLACE FUNCTION accept_portfolio_share(p_token_hash text)
  RETURNS uuid
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
  DECLARE
    v_user text := app_user_id();
    v_portfolio uuid;
  BEGIN
    IF v_user IS NULL THEN
      RETURN NULL;
    END IF;
    UPDATE portfolio_share s
       SET grantee_id = v_user, accepted_at = now(), token_hash = NULL
     WHERE s.token_hash = p_token_hash
       AND s.grantee_id IS NULL
       AND s.expires_at > now()
       AND s.owner_id <> v_user
       AND NOT EXISTS (SELECT 1 FROM portfolio_share x WHERE x.portfolio_id = s.portfolio_id AND x.grantee_id = v_user)
    RETURNING s.portfolio_id INTO v_portfolio;
    RETURN v_portfolio;
  END
  $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION peek_portfolio_share(text) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION accept_portfolio_share(text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION peek_portfolio_share(text) TO rt100k_app;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION accept_portfolio_share(text) TO rt100k_app;
