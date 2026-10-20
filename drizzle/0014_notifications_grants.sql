-- Rechte der App-Rolle für Hinweise, Kursalarme und Push-Abos (zusätzlich durch Row Level Security beschränkt).
GRANT SELECT, INSERT, UPDATE, DELETE ON "notification", "price_alert", "push_subscription" TO rt100k_app;
