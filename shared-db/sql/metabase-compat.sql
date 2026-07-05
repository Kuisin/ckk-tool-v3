-- Metabase compatibility views.
-- The labor dashboard (Metabase db 2) was built when the KOT tables lived in
-- the old kot-db's `public` schema. These pass-through views keep every
-- existing card / table-metadata reference working after the move to
-- schema-per-domain. New questions should use kot.* / directory.* directly.
-- Run as postgres against db ckk. Idempotent.

CREATE OR REPLACE VIEW public.v_labor            AS SELECT * FROM kot.v_labor;
CREATE OR REPLACE VIEW public.hr_records         AS SELECT * FROM kot.hr_records;
CREATE OR REPLACE VIEW public.employees          AS SELECT * FROM kot.employees;
CREATE OR REPLACE VIEW public.kot_employees      AS SELECT * FROM kot.kot_employees;
CREATE OR REPLACE VIEW public.kot_match_review   AS SELECT * FROM kot.kot_match_review;
CREATE OR REPLACE VIEW public.import_runs        AS SELECT * FROM kot.import_runs;
CREATE OR REPLACE VIEW public.employee_directory AS SELECT * FROM directory.employee_directory;
CREATE OR REPLACE VIEW public.ldap_sync_log      AS SELECT * FROM directory.ldap_sync_log;

GRANT USAGE ON SCHEMA public TO kot_ro, app;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO kot_ro, app;
