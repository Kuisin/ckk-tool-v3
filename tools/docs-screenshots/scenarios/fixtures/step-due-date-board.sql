-- step-due-date-board の準備（この 1 本の DB にだけ流す）。
--
-- 「今日」は JST で決める（アプリの業務日付と同じ。DB の current_date は UTC なので使わない）。
--
-- 過ぎた工程納期は画面からではなくここで入れる（画面で頼むのはふつう先の日付）:
--   #9001 段加工（進行中）    … 先月 10 日 → 赤くなるはず
--   #9001 切断（完了）        … 先月 5 日  → 完了しているので赤くしない
-- 作業場所一覧 (PD09) の日付切り替え用:
--   #9001 段加工検査承認 に、来月 10 日・マシニング 1号機（MC-01）の作業計画
BEGIN;

-- デモシードが見本として入れている工程納期を外す（この 1 本は「未設定」から始めて、
-- 画面で入れた日付と、下で入れる過去の日付だけを見る）。
UPDATE app.work_order_steps SET due_date = NULL
 WHERE work_order_id = 'dc000000-0000-4000-8000-000000009001';


UPDATE app.work_order_steps
   SET due_date = (date_trunc('month', (now() AT TIME ZONE 'Asia/Tokyo')) - interval '1 month' + interval '9 days')::date
 WHERE id = 'dc011000-0000-4000-8000-000000000004';

UPDATE app.work_order_steps
   SET due_date = (date_trunc('month', (now() AT TIME ZONE 'Asia/Tokyo')) - interval '1 month' + interval '4 days')::date
 WHERE id = 'dc011000-0000-4000-8000-000000000002';

INSERT INTO app.work_order_step_plans (work_order_step_id, user_id, planned_date, work_location_id, created_by)
VALUES ('dc011000-0000-4000-8000-000000000006', 'a0b1c2d3-0000-4000-8000-000000005107',
        (date_trunc('month', (now() AT TIME ZONE 'Asia/Tokyo')) + interval '1 month' + interval '9 days')::date,
        (SELECT id FROM app.work_locations WHERE code = 'MC-01'),
        'a0b1c2d3-0000-4000-8000-000000005107');

COMMIT;
