-- e2e-shipping-and-final-inspection.ts 用の追加フィクスチャ（使い捨て DB 専用）。
-- デモシードだけでは今回の 2 機能を通せないため、足りない状態を作る:
--   1. 出荷前検査（最終検査）工程を進行中の指示書に 1 つ足す
--   2. 出荷残のある明細 (…-02) を持つ指示書 9002 を完了にする
--      → 指示書 → 出荷書 の「次のステップ」が出る状態になる
--   3. 注文請書を確定（COMPLETED）にする
--      → 注文請書ピッカーの選択肢に出る（searchShippableAcceptanceOptions は
--        COMPLETED だけを返す）+ 注文請書詳細に「出荷書を作成」が出る
INSERT INTO app.work_order_steps
  (id, work_order_id, process_step_id, sort_order, execution_location, status, input_quantity, started_at)
SELECT gen_random_uuid(), w.id, c.id, 7, 'INTERNAL', 'IN_PROGRESS', 55, now()
FROM app.work_orders w, app.process_step_catalog c
WHERE w.work_order_number = 9001 AND c.code = 'PRE_SHIP_INSPECTION'
  AND NOT EXISTS (
    SELECT 1 FROM app.work_order_steps s
    WHERE s.work_order_id = w.id AND s.process_step_id = c.id);

UPDATE app.work_order_steps SET status='COMPLETED', completed_at=now(),
       output_success_quantity=COALESCE(output_success_quantity, input_quantity, 60)
 WHERE work_order_id=(SELECT id FROM app.work_orders WHERE work_order_number=9002);
UPDATE app.work_orders SET status='COMPLETED', approval_status='APPROVED', completed_at=now()
 WHERE work_order_number=9002;

UPDATE app.order_acceptances SET status='COMPLETED';

-- 4. 前回の実行が残した最終検査の打刻を消す（何度でも同じ結果になるように）。
DELETE FROM app.work_order_final_inspections;

-- 5. 明細 …-01 に受注残を作る（デモシードは 受注 50 に対し 100 出荷済みで、
--    「まとめますか」に出せる兄弟がいなくなる）。
UPDATE app.order_lines SET quantity = 200
 WHERE branch = 1 AND acceptance_year_month = '202607' AND acceptance_seq = 3;
