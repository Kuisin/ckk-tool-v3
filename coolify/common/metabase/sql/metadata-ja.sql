-- Metabase 表示名の日本語化（King of Time (労務) データソース）。
--
-- Metabase の「テーブル名 / 列名」は生の DB 名の自動整形（Hr Records 等）の
-- ままなので、意味の分かる日本語ラベルに置き換える。対象は
-- metabase_database.name が 'King of Time%' のデータソースだけ。
-- スキーマ本体（kot.* / directory.*）が正式名、public.* の互換ビューは
-- 「（旧）」を付けて新規クエリで選ばれにくくする（compat ビューの経緯は
-- shared-db/sql/metabase-compat.sql を参照）。
--
-- 適用先は Metabase の **アプリケーション DB（metabase-db）** — 業務 DB では
-- ない。API キーが管理者権限を持たないため REST ではなく直接 UPDATE する。
-- 冪等。適用後は metabase コンテナを再起動してキャッシュを確実に捨てる:
--
--   ssh 192.168.50.15
--   docker exec -i metabase-db psql -U metabase -d metabase < metadata-ja.sql
--   cd ~/stacks/metabase && docker compose restart metabase

BEGIN;

-- ─── テーブル表示名 ─────────────────────────────
WITH target AS (
  SELECT id FROM metabase_database WHERE name LIKE 'King of Time%'
), m(sch, tbl, ja) AS (VALUES
  ('kot',       'v_labor',            '労務データ'),
  ('kot',       'hr_records',         '勤怠記録'),
  ('kot',       'employees',          '従業員マッピング'),
  ('kot',       'kot_employees',      'KOT従業員名簿'),
  ('kot',       'kot_match_review',   '名寄せレビュー'),
  ('kot',       'import_runs',        'インポート履歴'),
  ('directory', 'employee_directory', '従業員ディレクトリ'),
  ('directory', 'ldap_sync_log',      'LDAP同期ログ'),
  -- 互換ビュー（旧 public スキーマ。既存カード用に残置 — 新規はスキーマ本体を使う）
  ('public',    'v_labor',            '労務データ（旧）'),
  ('public',    'hr_records',         '勤怠記録（旧）'),
  ('public',    'employees',          '従業員マッピング（旧）'),
  ('public',    'kot_employees',      'KOT従業員名簿（旧）'),
  ('public',    'kot_match_review',   '名寄せレビュー（旧）'),
  ('public',    'import_runs',        'インポート履歴（旧）'),
  ('public',    'employee_directory', '従業員ディレクトリ（旧）'),
  ('public',    'ldap_sync_log',      'LDAP同期ログ（旧）')
)
UPDATE metabase_table t
SET display_name = m.ja
FROM m, target
WHERE t.db_id = target.id
  AND t.schema = m.sch
  AND t.name   = m.tbl
  AND t.display_name IS DISTINCT FROM m.ja;

-- ─── 列表示名 ───────────────────────────────────
-- 列名 → 意味の日本語。この DB では同名列は全テーブルで同じ意味なので
-- 列名だけをキーに全テーブルへ当てる（KOT の時間系列は「分」単位）。
WITH target AS (
  SELECT id FROM metabase_database WHERE name LIKE 'King of Time%'
), m(col, ja) AS (VALUES
  -- 共通
  ('id',                      'ID'),
  ('username',                'ユーザー名'),
  ('employee_username',       'ユーザー名'),
  ('employee_code',           '従業員コード'),
  ('employee_name',           '氏名'),
  ('display_name',            '氏名'),
  ('name',                    '氏名'),
  ('status',                  '状態'),
  ('message',                 'メッセージ'),
  ('updated_at',              '更新日時'),
  ('date',                    '日付'),
  ('is_active',               '有効'),
  -- 従業員ディレクトリ（AD 由来）
  ('email',                   'メールアドレス'),
  ('department',              '部署'),
  ('title',                   '役職'),
  ('position',                '役職'),
  ('company',                 '会社'),
  ('office',                  '事業所'),
  ('manager',                 '上長'),
  ('last_synced_at',          '最終同期日時'),
  ('ldap_guid',               'LDAP GUID'),
  ('given_name',              '名'),
  ('sn',                      '姓'),
  ('cn',                      'CN'),
  ('upn',                     'UPN'),
  ('dn',                      'DN'),
  ('phone',                   '電話番号'),
  ('mobile',                  '携帯番号'),
  ('fax',                     'FAX番号'),
  ('description',             '説明'),
  ('member_of',               '所属グループ'),
  ('when_created',            'AD登録日時'),
  ('when_changed',            'AD更新日時'),
  ('account_expires',         'アカウント有効期限'),
  -- KOT 名簿・名寄せ
  ('last_seen_at',            '最終確認日時'),
  ('kot_name',                'KOT氏名'),
  ('candidates',              '候補'),
  -- 勤怠記録（KOT は分単位: 480 = 8h）
  ('zone',                    'ゾーン'),
  ('wt_normal',               '実労働時間(分)'),
  ('wt_overtime',             '普通残業(分)'),
  ('wt_overtime_night',       '深夜残業(分)'),
  ('wt_night',                '深夜手当(分)'),
  ('wt_leave_late',           '遅早欠時間(分)'),
  ('pto',                     '有休時間(分)'),
  ('plan_start',              '予定出勤'),
  ('plan_end',                '予定退勤'),
  ('record_starts',           '出勤打刻'),
  ('record_ends',             '退勤打刻'),
  ('rest_starts',             '休憩開始打刻'),
  ('rest_ends',               '休憩終了打刻'),
  -- 労務データ（v_labor — 分と時間の両方を持つ）
  ('work_minutes',            '労働時間(分)'),
  ('work_hours',              '労働時間'),
  ('overtime_minutes',        '残業(分)'),
  ('overtime_hours',          '残業時間'),
  ('overtime_night_minutes',  '深夜残業(分)'),
  ('night_allowance_minutes', '深夜手当(分)'),
  ('leave_late_minutes',      '遅早欠(分)'),
  ('pto_minutes',             '有休(分)'),
  ('pto_hours',               '有休時間'),
  ('clock_in_count',          '出勤打刻回数'),
  -- インポート履歴 / LDAP同期ログ
  ('finished_at',             '完了時刻'),
  ('start_date',              '開始日'),
  ('end_date',                '終了日'),
  ('days',                    '日数'),
  ('rows',                    '取込件数'),
  ('kind',                    '種別'),
  ('total',                   '件数')
)
UPDATE metabase_field f
SET display_name = m.ja
FROM m, metabase_table t, target
WHERE f.table_id = t.id
  AND t.db_id = target.id
  AND f.name = m.col
  AND f.display_name IS DISTINCT FROM m.ja;

COMMIT;
