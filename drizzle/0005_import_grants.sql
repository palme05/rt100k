-- Rechte der App-Rolle für den Import (zusätzlich durch Row Level Security beschränkt).
-- Importierte Dateien: nur anlegen, lesen und löschen (Konto löschen), nie ändern.
GRANT SELECT, INSERT, DELETE ON "import_file" TO rt100k_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "csv_mapping" TO rt100k_app;
