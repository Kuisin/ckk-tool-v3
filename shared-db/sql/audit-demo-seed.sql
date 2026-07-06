-- audit-demo-seed.sql — 操作履歴（audit_logs）を実データで確認するためのデモ投入。
--
-- 既存のマスタ（取引先・製品）を参照し、試算 → 価格表 → 見積書 の 1 チェーンと、
-- それぞれの CREATE 履歴（actor = システムユーザー）を投入する。冪等（再実行安全）。
-- すべてシステム操作として記録し、末尾に SEED システムイベントを 1 件残す。
--
-- 実行: shared-db で `psql "$DATABASE_URL" -f sql/audit-demo-seed.sql`
-- （本番では不要。dev で履歴機能を目視確認する用途）。

DO $$
DECLARE
  v_sys       uuid := '00000000-0000-0000-0000-000000000000';
  v_customer  uuid;
  v_product   text;
  v_ym        text := '202607';
  v_seq       int  := 1;
  v_est_no    text := 'EST-202607-00001';
  v_qot_no    text := 'QOT-202607-00001';
  v_entry_key text;
BEGIN
  -- システムユーザーが無ければ何もしない（FK 保護）。
  IF NOT EXISTS (SELECT 1 FROM app.users WHERE id = v_sys) THEN
    RAISE NOTICE 'system user missing; run migration 20260706040000_add_system_user first';
    RETURN;
  END IF;

  SELECT bp_id INTO v_customer
  FROM app.bp_role_assignments
  WHERE role = 'CUSTOMER' AND is_active
  ORDER BY bp_id LIMIT 1;
  SELECT id INTO v_product FROM app.products ORDER BY id LIMIT 1;

  IF v_customer IS NULL OR v_product IS NULL THEN
    RAISE NOTICE 'no customer/product master data; skipping demo seed';
    RETURN;
  END IF;

  v_entry_key := v_customer || '__' || v_product || '__PRODUCTION';

  -- 試算（EST-202607-00001）
  INSERT INTO app.estimates
    (year_month, seq, name, tool_type, status, customer_bp_id, input, created_by, created_at, updated_at)
  VALUES
    (v_ym, v_seq, 'デモ試算 φ3×38', 'ROUND_BAR', 'CONFIRMED', v_customer,
     '{"toolType":"ROUND_BAR","maxDiameter":3,"totalLength":38,"materialBarPrice":1200,"machiningMinutes":4}'::jsonb,
     v_sys, now(), now())
  ON CONFLICT (year_month, seq) DO NOTHING;

  -- 価格表エントリ + 段階
  INSERT INTO app.price_list_entries
    (customer_bp_id, product_id, order_type, base_unit_price, valid_from, is_active,
     estimate_year_month, estimate_seq, created_by, created_at, updated_at)
  VALUES
    (v_customer, v_product, 'PRODUCTION', 1000, CURRENT_DATE, true, v_ym, v_seq, v_sys, now(), now())
  ON CONFLICT (customer_bp_id, product_id, order_type) DO NOTHING;

  INSERT INTO app.price_list_tiers
    (customer_bp_id, product_id, order_type, min_quantity, max_quantity, multiplier, sort_order)
  SELECT v_customer, v_product, 'PRODUCTION', 1, NULL, 1, 0
  WHERE NOT EXISTS (
    SELECT 1 FROM app.price_list_tiers
    WHERE customer_bp_id = v_customer AND product_id = v_product AND order_type = 'PRODUCTION'
  );

  -- 見積書（QOT-202607-00001）+ 明細
  INSERT INTO app.quotes
    (year_month, seq, customer_bp_id, status, created_by, created_at, updated_at)
  VALUES
    (v_ym, v_seq, v_customer, 'DRAFT', v_sys, now(), now())
  ON CONFLICT (year_month, seq) DO NOTHING;

  INSERT INTO app.quote_items
    (quote_year_month, quote_seq, product_id, order_type, quantity, unit_price, amount, sort_order)
  SELECT v_ym, v_seq, v_product, 'PRODUCTION', 100, 1000, 100000, 0
  WHERE NOT EXISTS (
    SELECT 1 FROM app.quote_items WHERE quote_year_month = v_ym AND quote_seq = v_seq
  );

  -- 履歴（CREATE, actor = システム）— record_id は各画面の業務識別子。
  INSERT INTO app.audit_logs (user_id, action, table_name, record_id, after_data)
  SELECT v_sys, 'CREATE', 'estimates', v_est_no,
         jsonb_build_object('note', 'デモ試算を作成', 'status', 'CONFIRMED')
  WHERE NOT EXISTS (SELECT 1 FROM app.audit_logs WHERE table_name='estimates' AND record_id=v_est_no);

  INSERT INTO app.audit_logs (user_id, action, table_name, record_id, after_data)
  SELECT v_sys, 'CREATE', 'price_list_entries', v_entry_key,
         jsonb_build_object('note', 'デモ価格表を作成', 'baseUnitPrice', 1000)
  WHERE NOT EXISTS (SELECT 1 FROM app.audit_logs WHERE table_name='price_list_entries' AND record_id=v_entry_key);

  INSERT INTO app.audit_logs (user_id, action, table_name, record_id, after_data)
  SELECT v_sys, 'CREATE', 'quotes', v_qot_no,
         jsonb_build_object('note', 'デモ見積書を作成', 'status', 'DRAFT')
  WHERE NOT EXISTS (SELECT 1 FROM app.audit_logs WHERE table_name='quotes' AND record_id=v_qot_no);

  -- SEED システムイベント（この投入自体を履歴に残す）
  INSERT INTO app.audit_logs (user_id, action, table_name, record_id, after_data)
  SELECT v_sys, 'SEED', 'system', 'audit-demo-seed',
         jsonb_build_object('note', 'デモデータ投入（試算・価格表・見積書）')
  WHERE NOT EXISTS (SELECT 1 FROM app.audit_logs WHERE action='SEED' AND record_id='audit-demo-seed');
END $$;
