-- Rechte der App-Rolle für die ETF-Durchschau (zusätzlich durch Row Level Security beschränkt).
GRANT SELECT, INSERT, UPDATE, DELETE ON "etf_breakdown" TO rt100k_app;
