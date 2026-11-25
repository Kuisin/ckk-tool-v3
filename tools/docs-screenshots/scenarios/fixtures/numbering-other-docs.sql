-- numbering-other-docs.sql — 外注依頼と共有端末からの入出庫伝票を「画面で」起こせる状態にする
-- （company-tsp.sql のあとに流す）。番号そのものは 1 つも入れない — 採番は画面の操作で起きる。
--
-- 1) 指示書 9002（承認依頼中）を承認済みにし、段加工（4 工程目）を外注工程にする。
--    依頼日はまだ無い = 外注依頼の番号（OUT）はまだ振られていない。画面で依頼日を
--    入れた時点で DB が OUT を払い出す。
--    （外注日程は、承認済み・進行中の指示書でしか入力できない。シードの外注工程は
--      どれも依頼日が入っていて、番号ももう持っている。）
UPDATE app.work_orders
   SET status = 'APPROVED', approval_status = 'APPROVED', approved_at = now()
 WHERE work_order_number = 9002;

UPDATE app.approval_requests
   SET status = 'APPROVED'
 WHERE target_type = 'work_orders' AND target_id = '9002' AND status = 'PENDING';

UPDATE app.work_order_steps
   SET execution_location = 'OUTSOURCE',
       plant_id = NULL,
       supplier_bp_id = (SELECT supplier_bp_id FROM app.work_order_steps
                          WHERE id = 'dc012000-0000-4000-8000-000000000003')
 WHERE id = 'dc012000-0000-4000-8000-000000000004';

-- 2) 指示書 9001（進行中）を「最後の 1 工程だけが残っている」状態にする。
--    段加工（4 工程目・進行中）と段加工検査（5 工程目）を完了にし、段加工検査承認
--    （6 工程目・数量を記録しない工程）だけを未着手で残す。共有端末でこの工程を
--    完了すると指示書が完了し、完成品の入庫の入出庫伝票（MOV）が共有端末から起きる。
UPDATE app.work_order_step_actuals
   SET ended_at = now()
 WHERE ended_at IS NULL
   AND work_order_step_id = 'dc011000-0000-4000-8000-000000000004';

UPDATE app.work_order_steps
   SET status = 'COMPLETED', output_success_quantity = 51,
       completed_at = now(), completed_by = 'a0b1c2d3-0000-4000-8000-000000005107',
       session_locked_by = NULL, session_locked_at = NULL
 WHERE id = 'dc011000-0000-4000-8000-000000000004';

UPDATE app.work_order_steps
   SET status = 'COMPLETED', input_quantity = 51, output_success_quantity = 51,
       started_at = now(), started_by = 'a0b1c2d3-0000-4000-8000-000000005107',
       completed_at = now(), completed_by = 'a0b1c2d3-0000-4000-8000-000000005107'
 WHERE id = 'dc011000-0000-4000-8000-000000000005';
