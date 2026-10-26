-- Ziel-Freigaben wie Depot-Freigaben (0012): der Besitzer legt Links an, sieht
-- und widerruft sie; der Empfänger sieht angenommene Freigaben und kann sie
-- verlassen. Kein UPDATE für die App – Annehmen geht nur über accept_goal_share().
GRANT SELECT, INSERT, DELETE ON "goal_share" TO rt100k_app;
--> statement-breakpoint
-- Vorschau eines gültigen Links (Ziel- und Besitzername, Recht), bevor der
-- Empfänger die Zeile sehen darf. SECURITY DEFINER mit festem search_path; nur
-- für angemeldete Nutzer, nicht für den Besitzer selbst.
CREATE OR REPLACE FUNCTION peek_goal_share(p_token_hash text)
  RETURNS TABLE (goal_name text, owner_name text, role text, expires_at timestamptz)
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
    SELECT g.name, u.name, s.role, s.expires_at
      FROM goal_share s
      JOIN goal g ON g.id = s.goal_id AND g.owner_id = s.owner_id
      JOIN "user" u ON u.id = s.owner_id
     WHERE app_user_id() IS NOT NULL
       AND s.token_hash = p_token_hash
       AND s.grantee_id IS NULL
       AND s.expires_at > now()
       AND s.owner_id <> app_user_id()
  $$;
--> statement-breakpoint
-- Link einlösen: einmalig, nur gültige Links, nicht das eigene Ziel, keine
-- doppelte Freigabe. Liefert die Ziel-ID oder NULL.
CREATE OR REPLACE FUNCTION accept_goal_share(p_token_hash text)
  RETURNS uuid
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
  DECLARE
    v_user text := app_user_id();
    v_goal uuid;
  BEGIN
    IF v_user IS NULL THEN
      RETURN NULL;
    END IF;
    UPDATE goal_share s
       SET grantee_id = v_user, accepted_at = now(), token_hash = NULL
     WHERE s.token_hash = p_token_hash
       AND s.grantee_id IS NULL
       AND s.expires_at > now()
       AND s.owner_id <> v_user
       AND NOT EXISTS (SELECT 1 FROM goal_share x WHERE x.goal_id = s.goal_id AND x.grantee_id = v_user)
    RETURNING s.goal_id INTO v_goal;
    RETURN v_goal;
  END
  $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION peek_goal_share(text) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION accept_goal_share(text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION peek_goal_share(text) TO rt100k_app;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION accept_goal_share(text) TO rt100k_app;
