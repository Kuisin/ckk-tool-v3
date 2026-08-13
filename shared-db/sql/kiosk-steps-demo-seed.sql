-- kiosk-steps-demo-seed.sql — キオスク工程実行アプリの表示確認用デモ投入（dev 専用・任意）。
--
-- demo1（田中 一郎）に「本日の担当工程」が見えるように、
--   受注（既存の受注請書に紐付く注文請書 branch=90）
--   → 指示書（承認済・切断 → 段加工 → 段加工検査 の 3 工程）
--   → 検査表テンプレート（デモ・3 項目）を指示書へ紐付け
--   → 本日分の作業計画（work_order_step_plans）を demo1 へ割り当て
-- を作成する。段加工検査は STEP_MACHINING 完了までは実行依存で「前工程待ち」
-- になるので、開始可 / 前工程待ち / 検査（INSPECTION モード）の 3 状態が
-- キオスクの一覧・実行画面で確認できる。
--
-- 冪等: notes = 'kiosk-demo-seed' の指示書があれば何もしない。
-- 適用: cd shared-db && pnpm remote sh -c 'psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f sql/kiosk-steps-demo-seed.sql'

DO $$
DECLARE
  v_sys uuid := '00000000-0000-0000-0000-000000000000';
  v_demo1 uuid;
  v_customer uuid;
  v_oa_ym char(6);
  v_oa_seq int;
  v_so uuid;
  v_wo uuid;
  v_wo_number int;
  v_tpl int;
  v_step_cutting uuid;
  v_step_machining uuid;
  v_step_inspection uuid;
  v_today date := (now() AT TIME ZONE 'Asia/Tokyo')::date;
BEGIN
  -- 冪等ガード
  IF EXISTS (SELECT 1 FROM app.work_orders WHERE notes = 'kiosk-demo-seed') THEN
    RAISE NOTICE 'kiosk-steps-demo-seed: already applied, skipping';
    RETURN;
  END IF;

  SELECT id INTO v_demo1 FROM app.users WHERE username = 'demo1';
  IF v_demo1 IS NULL THEN
    RAISE EXCEPTION 'demo1 user not found (run demo-users-seed.sql first)';
  END IF;

  -- 顧客: CUSTOMER ロールを持つ BP の先頭
  SELECT bp.id INTO v_customer
    FROM app.business_partners bp
    JOIN app.bp_role_assignments r ON r.bp_id = bp.id AND r.role = 'CUSTOMER'
    WHERE bp.is_active ORDER BY bp.bp_code LIMIT 1;
  IF v_customer IS NULL THEN
    RAISE EXCEPTION 'no CUSTOMER business partner found (run import:legacy first)';
  END IF;

  -- 受注請書: 最新の 1 件へ相乗り（branch=90 でアプリ採番と衝突しない）
  SELECT year_month, seq INTO v_oa_ym, v_oa_seq
    FROM app.order_acceptances ORDER BY year_month DESC, seq DESC LIMIT 1;
  IF v_oa_ym IS NULL THEN
    RAISE EXCEPTION 'no order_acceptances found';
  END IF;

  -- 注文請書（製品 1 = テスト製品１・数量 50）
  INSERT INTO app.sales_orders
    (id, year_month, seq, branch, customer_bp_id, product_id, order_type,
     quantity, unit_price, amount, delivery_date, status, is_locked,
     notes, created_by, created_at, updated_at)
  VALUES
    (gen_random_uuid(), v_oa_ym, v_oa_seq, 90, v_customer, 1, 'PRODUCTION',
     50, 1200, 60000, v_today + 14, 'CONFIRMED', false,
     'kiosk-demo-seed', v_sys, now(), now())
  RETURNING id INTO v_so;

  -- 指示書番号: nextSerialNumber("WORK_ORDER") と同じ upsert
  INSERT INTO app.numbering_sequences (key, prefix, last_year_month, last_sequence, updated_at)
  VALUES ('WORK_ORDER', 'WO', NULL, 1, now())
  ON CONFLICT (key) DO UPDATE SET
    last_sequence = app.numbering_sequences.last_sequence + 1,
    updated_at = now()
  RETURNING last_sequence INTO v_wo_number;

  -- 指示書（承認済 — キオスクから開始できる状態）
  INSERT INTO app.work_orders
    (id, work_order_number, sales_order_id, type, planned_quantity,
     status, approval_status, approved_at, history, notes,
     created_by, created_at, updated_at)
  VALUES
    (gen_random_uuid(), v_wo_number, v_so, 'MANUFACTURE', 50,
     'APPROVED', 'APPROVED', now(),
     jsonb_build_array(jsonb_build_object(
       'action', 'CREATE', 'user', v_sys::text, 'at', now()::text,
       'notes', 'kiosk-steps-demo-seed')),
     'kiosk-demo-seed', v_sys, now(), now())
  RETURNING id INTO v_wo;

  -- ロット番号 = 指示書番号（アプリの作成ロジックと同じ）
  UPDATE app.sales_orders SET lot_number = v_wo_number WHERE id = v_so AND lot_number IS NULL;

  -- 工程: 切断(5) → 段加工(13) → 段加工検査(14)。
  -- 段加工検査は exec 依存（14 AND 13）により段加工完了まで開始不可。
  INSERT INTO app.work_order_steps
    (id, work_order_id, process_step_id, sort_order, execution_location, factory_id, status)
  VALUES (gen_random_uuid(), v_wo, 5, 1, 'INTERNAL', 1, 'PENDING')
  RETURNING id INTO v_step_cutting;
  INSERT INTO app.work_order_steps
    (id, work_order_id, process_step_id, sort_order, execution_location, factory_id, status)
  VALUES (gen_random_uuid(), v_wo, 13, 2, 'INTERNAL', 1, 'PENDING')
  RETURNING id INTO v_step_machining;
  INSERT INTO app.work_order_steps
    (id, work_order_id, process_step_id, sort_order, execution_location, factory_id, status)
  VALUES (gen_random_uuid(), v_wo, 14, 3, 'INTERNAL', 1, 'PENDING')
  RETURNING id INTO v_step_inspection;

  -- 検査表テンプレート（デモ）+ 指示書への紐付け
  SELECT id INTO v_tpl FROM app.inspection_templates WHERE code = 'DEMO-STEP-INSP';
  IF v_tpl IS NULL THEN
    INSERT INTO app.inspection_templates (code, name, related_process_step_id, is_active, created_at, updated_at)
    VALUES ('DEMO-STEP-INSP',
            jsonb_build_object('ja', '段加工検査表（デモ）', 'en', 'Step machining inspection (demo)'),
            14, true, now(), now())
    RETURNING id INTO v_tpl;
    INSERT INTO app.inspection_template_items
      (template_id, item_name, unit, tolerance_min, tolerance_max, is_required, sort_order)
    VALUES
      (v_tpl, jsonb_build_object('ja', '外径', 'en', 'Outer diameter'), 'mm', 7.98, 8.02, true, 1),
      (v_tpl, jsonb_build_object('ja', '全長', 'en', 'Overall length'), 'mm', 329.5, 330.5, true, 2),
      (v_tpl, jsonb_build_object('ja', '外観', 'en', 'Appearance'), NULL, NULL, NULL, false, 3);
  END IF;
  INSERT INTO app.work_order_inspection_templates (work_order_id, inspection_template_id)
  VALUES (v_wo, v_tpl)
  ON CONFLICT DO NOTHING;

  -- 本日の作業計画を demo1 へ（3 工程とも・数量 50・時刻指定なし = 終日）
  INSERT INTO app.work_order_step_plans
    (id, work_order_step_id, user_id, planned_date, quantity, notes, created_by, created_at)
  VALUES
    (gen_random_uuid(), v_step_cutting,    v_demo1, v_today, 50, 'kiosk-demo-seed', v_sys, now()),
    (gen_random_uuid(), v_step_machining,  v_demo1, v_today, 50, 'kiosk-demo-seed', v_sys, now()),
    (gen_random_uuid(), v_step_inspection, v_demo1, v_today, 50, 'kiosk-demo-seed', v_sys, now());

  -- 投入自体を履歴に残す
  INSERT INTO app.audit_logs (user_id, action, table_name, record_id, after_data)
  VALUES (v_sys, 'SEED', 'system', 'kiosk-steps-demo-seed',
          jsonb_build_object('note',
            format('キオスク工程実行デモ投入（指示書 #%s・工程 3・計画 3 → demo1）', v_wo_number)));

  RAISE NOTICE 'kiosk-steps-demo-seed: created work order #% with 3 steps, plans assigned to demo1', v_wo_number;
END $$;
