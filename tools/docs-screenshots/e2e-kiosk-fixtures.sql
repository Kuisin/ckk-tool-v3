-- e2e-kiosk-inspection-approval.ts 用のフィクスチャ（使い捨て DB 専用）。
-- デモシードだけでは検査承認を触れる状態にならないので、足りない分を作る:
--   1. 検査承認工程（#9001 段加工検査承認）を「自分の担当・作業中」にする
--   2. 承認対象の検査記録を 3 種類（合格 / 不合格 / 承認済）置く
--   3. 合格の記録に、検査表の記入内容（実測値・合否）を入れる
--      → 「検査表を見る」で中身が読めることを確かめるため
-- 何度流しても同じ結果になる。
UPDATE app.work_order_steps SET status='IN_PROGRESS', started_at=now(),
  session_locked_by='a0b1c2d3-0000-4000-8000-000000005107', session_locked_at=now(),
  input_quantity=51
 WHERE id='dc011000-0000-4000-8000-000000000006';
INSERT INTO app.work_order_step_plans (work_order_step_id, user_id, planned_date, quantity)
VALUES ('dc011000-0000-4000-8000-000000000006','a0b1c2d3-0000-4000-8000-000000005107', current_date, 51)
ON CONFLICT DO NOTHING;
INSERT INTO app.work_order_step_actuals (work_order_step_id, user_id, worked_date, started_at, concurrent_count)
VALUES ('dc011000-0000-4000-8000-000000000006','a0b1c2d3-0000-4000-8000-000000005107', current_date, now(), 1)
ON CONFLICT DO NOTHING;
INSERT INTO app.inspection_records (id, work_order_step_id, template_id, status, recorded_by, recorded_at)
VALUES
 ('aa000000-0000-4000-8000-000000000001','dc011000-0000-4000-8000-000000000005',9102,'PASS','a0b1c2d3-0000-4000-8000-000000005107', now()),
 ('aa000000-0000-4000-8000-000000000002','dc011000-0000-4000-8000-000000000005',9102,'FAIL','a0b1c2d3-0000-4000-8000-000000005107', now()),
 ('aa000000-0000-4000-8000-000000000003','dc011000-0000-4000-8000-000000000002',9102,'APPROVED','a0b1c2d3-0000-4000-8000-000000005107', now())
ON CONFLICT (id) DO NOTHING;
UPDATE app.inspection_records SET approved_by='a0b1c2d3-0000-4000-8000-000000005107', approved_at=now()
 WHERE id='aa000000-0000-4000-8000-000000000003';
UPDATE app.inspection_records SET status='PASS', approved_by=NULL, approved_at=NULL
 WHERE id='aa000000-0000-4000-8000-000000000001';
INSERT INTO app.inspection_record_items (inspection_record_id, template_item_id, measured_value, measured_values, is_pass)
SELECT 'aa000000-0000-4000-8000-000000000001', i.id, NULL,
       CASE WHEN i.input_type='NUMBER' THEN '["6.01","5.99"]'::jsonb ELSE '["true"]'::jsonb END, true
FROM app.inspection_template_items i WHERE i.template_id=9102
ON CONFLICT DO NOTHING;
