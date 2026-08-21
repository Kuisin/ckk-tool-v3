-- Metabase 互換ビュー — 廃止（RETIRED 2026-08）。
--
-- 労務ダッシュボード（Metabase db 2）は KOT テーブルが旧 kot-db の `public`
-- スキーマにあった頃に作られ、schema-per-domain へ移行したあとも既存カードを
-- 動かすためこの 8 ビューを public.* に置いていた。全カード（44–49 の構造化
-- クエリ）と AI ラボ MCP は kot.* / directory.* を直接参照するよう付け替え済みで、
-- どのビューももう参照されていない。よってビューを撤去する。
--
-- bare 名（`v_labor` 等）で書かれた native カードは kot_ro の search_path
-- （kot, directory）で解決されるので影響なし。`public` スキーマ自体は Prisma の
-- `public._prisma_migrations` が残るため drop しない（ビューだけ落とす）。
--
-- 冪等。Run as postgres against db ckk:
--   docker exec -i shared-db psql -U postgres -d ckk < metabase-compat.sql

DROP VIEW IF EXISTS public.v_labor;
DROP VIEW IF EXISTS public.hr_records;
DROP VIEW IF EXISTS public.employees;
DROP VIEW IF EXISTS public.kot_employees;
DROP VIEW IF EXISTS public.kot_match_review;
DROP VIEW IF EXISTS public.import_runs;
DROP VIEW IF EXISTS public.employee_directory;
DROP VIEW IF EXISTS public.ldap_sync_log;
