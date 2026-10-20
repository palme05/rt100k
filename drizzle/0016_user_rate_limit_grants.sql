-- Rechte der App-Rolle für die Zähler je Nutzer (zusätzlich durch Row Level Security beschränkt).
-- Kein DELETE: Zeilen verschwinden nur mit dem Konto (Kaskade).
GRANT SELECT, INSERT, UPDATE ON "user_rate_limit" TO rt100k_app;
