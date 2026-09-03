-- local-kot-demo.sql — synthetic 労務 (kot) schema + demo data for the throwaway
-- manual-screenshot DB only. Structure copied read-only from production's real
-- DDL (kot.employees / kot.hr_records / kot.import_runs / kot.kot_employees /
-- kot.kot_match_review / kot.v_labor) via `pg_dump --schema-only -n kot`.
-- Every row below is fabricated — no real employee ever appears.

BEGIN;

CREATE TABLE kot.employees (
    employee_code integer NOT NULL,
    username text NOT NULL
);
ALTER TABLE ONLY kot.employees ADD CONSTRAINT employees_pkey PRIMARY KEY (employee_code);

CREATE TABLE kot.hr_records (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    employee_username text NOT NULL,
    zone text NOT NULL,
    date date NOT NULL,
    wt_normal integer,
    wt_overtime integer,
    wt_overtime_night integer,
    wt_night integer,
    wt_leave_late integer,
    pto integer,
    plan_start timestamp(6) without time zone,
    plan_end timestamp(6) without time zone,
    record_starts timestamp(6) without time zone[],
    record_ends timestamp(6) without time zone[],
    rest_starts timestamp(6) without time zone[],
    rest_ends timestamp(6) without time zone[]
);

CREATE TABLE kot.import_runs (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    finished_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    start_date date,
    end_date date,
    days integer,
    rows integer,
    status text,
    message text
);

CREATE TABLE kot.kot_employees (
    employee_code integer PRIMARY KEY,
    name text NOT NULL,
    last_seen_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE kot.kot_match_review (
    employee_code integer NOT NULL,
    kot_name text NOT NULL,
    status text NOT NULL,
    candidates jsonb DEFAULT '[]'::jsonb NOT NULL,
    updated_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE VIEW kot.v_labor AS
 SELECT h.date,
    h.employee_username AS username,
    COALESCE(ed.display_name, ke.name) AS employee_name,
    e.employee_code,
    ed.department,
    ed.title AS "position",
    ed.company,
    ed.is_active,
    h.wt_normal AS work_minutes,
    round(((h.wt_normal)::numeric / 60.0), 2) AS work_hours,
    h.wt_overtime AS overtime_minutes,
    round(((h.wt_overtime)::numeric / 60.0), 2) AS overtime_hours,
    h.wt_overtime_night AS overtime_night_minutes,
    h.wt_night AS night_allowance_minutes,
    h.wt_leave_late AS leave_late_minutes,
    h.pto AS pto_minutes,
    round(((h.pto)::numeric / 60.0), 2) AS pto_hours,
    array_length(h.record_starts, 1) AS clock_in_count,
    h.plan_start,
    h.plan_end,
    h.record_starts,
    h.record_ends
   FROM (((kot.hr_records h
     LEFT JOIN kot.employees e ON ((e.username = h.employee_username)))
     LEFT JOIN kot.kot_employees ke ON ((ke.employee_code = e.employee_code)))
     LEFT JOIN directory.employee_directory ed ON ((ed.username = h.employee_username)));

-- 権限は grants.sql の ALTER DEFAULT PRIVILEGES（postgres が発行済み）で
-- kot_ro / app / ldap_sync / kot に自動で付く（postgres が作った新規テーブル
-- のため）。念のため明示しておく。
GRANT SELECT ON ALL TABLES IN SCHEMA kot TO kot_ro, app, ldap_sync;

-- ─── 架空の従業員（6 名・2 部署系統）───────────────────────────────
INSERT INTO directory.employee_directory
  (username, display_name, department, title, company, is_active, last_synced_at)
VALUES
  ('demo6',  '山本 六郎', '製造1課',   '主任',   '本社工場', true, now()),
  ('demo7',  '中村 七美', '製造1課',   '担当',   '本社工場', true, now()),
  ('demo8',  '小林 八郎', '製造2課',   '担当',   '第二工場', true, now()),
  ('demo9',  '加藤 久美', '品質保証部', '係長',   '本社工場', true, now()),
  ('demo10', '吉田 十',   '総務部',    '担当',   '本社工場', true, now()),
  ('demo11', '渡辺 十一', '製造2課',   '担当',   '第二工場', true, now())
ON CONFLICT (username) DO NOTHING;

INSERT INTO kot.employees (employee_code, username) VALUES
  (9006, 'demo6'), (9007, 'demo7'), (9008, 'demo8'),
  (9009, 'demo9'), (9010, 'demo10'), (9011, 'demo11')
ON CONFLICT (employee_code) DO NOTHING;

INSERT INTO kot.kot_employees (employee_code, name) VALUES
  (9006, '山本 六郎'), (9007, '中村 七美'), (9008, '小林 八郎'),
  (9009, '加藤 久美'), (9010, '吉田 十'), (9011, '渡辺 十一')
ON CONFLICT (employee_code) DO NOTHING;

-- ─── 勤怠実績（平日のみ・直近 1 ヶ月分）───────────────────────────────
-- 実労働 7.5h 前後 + 曜日と社員番号で決まる緩やかな残業パターン（毎回同じ形）。
INSERT INTO kot.hr_records
  (employee_username, zone, date, wt_normal, wt_overtime, wt_overtime_night,
   wt_night, wt_leave_late, pto, plan_start, plan_end)
SELECT
  u.username,
  'JPN',
  d::date,
  450,
  CASE WHEN ((u.n + extract(dow FROM d)::int) % 4 = 0) THEN 30 + (u.n * 7) % 60 ELSE 0 END,
  0, 0, 0, 0,
  d + time '08:30',
  d + time '17:30'
FROM generate_series((current_date - interval '32 days')::date, current_date, interval '1 day') AS d
CROSS JOIN (VALUES ('demo6',1),('demo7',2),('demo8',3),('demo9',4),('demo10',5),('demo11',6)) AS u(username, n)
WHERE extract(dow FROM d) BETWEEN 1 AND 5;

COMMIT;
