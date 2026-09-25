-- kot.hr_records の追加列（KOT 日別出力レイアウト auto_import_v2 の新項目）と
-- それを見せる kot.v_labor の拡張。
--
-- kot スキーマは Prisma 管理外（旧来の `CREATE TABLE IF NOT EXISTS` 流儀）で、
-- テーブルの所有者は postgres。kot-import のロール `kot` は所有者ではないので
-- ALTER できない — だからインポーターに自己修復させず、ここに置いて postgres で流す。
--
-- 冪等（何度流してもよい）。列はすべて NULL 可・追加のみ:
--   NULL = その行を取り込んだ時点の出力レイアウトに項目が無かった（旧 auto_import）
--   0    = 項目はあったが値が空・0
-- 既存の行を 0 で埋めない — 「無かった」と「0 だった」を区別するため。
--
-- 単位は既存列と同じ（分）。刻限は書式を確認できるまで生のテキストで持つ。

BEGIN;

ALTER TABLE kot.hr_records
  ADD COLUMN IF NOT EXISTS wt_scheduled       integer,  -- カ）所定内時間
  ADD COLUMN IF NOT EXISTS wt_holiday         integer,  -- カ）休日時間
  ADD COLUMN IF NOT EXISTS wt_holiday_night   integer,  -- カ）休日深夜
  ADD COLUMN IF NOT EXISTS absence_part       integer,  -- 欠勤(パート)時間休取得時間
  ADD COLUMN IF NOT EXISTS absence_leave      integer,  -- 欠勤(産休育休)時間休取得時間
  ADD COLUMN IF NOT EXISTS shift_limit_start  text,     -- 勤務開始刻限
  ADD COLUMN IF NOT EXISTS shift_limit_end    text;     -- 勤務終了刻限

-- 既存の列を先頭にそのまま残し、新しい列を末尾に足す（CREATE OR REPLACE VIEW の条件）。
CREATE OR REPLACE VIEW kot.v_labor AS
 SELECT h.date,
    h.employee_username AS username,
    COALESCE(ed.display_name, ke.name) AS employee_name,
    e.employee_code,
    ed.department,
    ed.title AS "position",
    ed.company,
    ed.is_active,
    h.wt_normal AS work_minutes,
    round((h.wt_normal::numeric / 60.0), 2) AS work_hours,
    h.wt_overtime AS overtime_minutes,
    round((h.wt_overtime::numeric / 60.0), 2) AS overtime_hours,
    h.wt_overtime_night AS overtime_night_minutes,
    h.wt_night AS night_allowance_minutes,
    h.wt_leave_late AS leave_late_minutes,
    h.pto AS pto_minutes,
    round((h.pto::numeric / 60.0), 2) AS pto_hours,
    array_length(h.record_starts, 1) AS clock_in_count,
    h.plan_start,
    h.plan_end,
    h.record_starts,
    h.record_ends,
    h.wt_scheduled AS scheduled_minutes,
    h.wt_holiday AS holiday_minutes,
    h.wt_holiday_night AS holiday_night_minutes,
    h.absence_part AS absence_part_minutes,
    h.absence_leave AS absence_leave_minutes,
    h.shift_limit_start,
    h.shift_limit_end
   FROM kot.hr_records h
     LEFT JOIN kot.employees e ON e.username = h.employee_username
     LEFT JOIN kot.kot_employees ke ON ke.employee_code = e.employee_code
     LEFT JOIN directory.employee_directory ed ON ed.username = h.employee_username;

COMMIT;
