-- ROLLBACK for 20260730160000_training_report_tables.sql. Apply via MCP/psql;
-- NOT a migration (this directory is not scanned by the CLI).
drop table if exists public.report_runs;
drop table if exists public.training_targets;
