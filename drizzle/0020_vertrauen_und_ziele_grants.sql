-- Rechte der App-Rolle für Rückgängig, Watchlist und eigene Ziele (zusätzlich durch Row Level Security beschränkt).
GRANT SELECT, INSERT, DELETE ON "booking_undo" TO rt100k_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "watchlist_item", "goal", "goal_portfolio" TO rt100k_app;
