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
  v_product   int;
  -- 旧番号（legacy_number）。書類番号そのものは DB が INSERT 時に払い出す。
  v_est_no    text := 'EST-202607-00001';
  v_prc_no    text := 'PRC-202607-90001';
  v_qot_no    text := 'QOT-202607-00001';
  v_est_id    uuid;
  v_entry_id  uuid;
  v_quote_id  uuid;
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
  SELECT id INTO v_product FROM app.items WHERE item_type = 'PRODUCT' ORDER BY id LIMIT 1;

  IF v_customer IS NULL OR v_product IS NULL THEN
    RAISE NOTICE 'no customer/product master data; skipping demo seed';
    RETURN;
  END IF;

  -- 撮影用の販売デモ（sales-demo-seed.sql）が既に居る DB・2 回目の実行では何もしない —
  -- 同じ旧番号（EST-202607-00001 / QOT-202607-00001）を使うため、二重投入を避ける。
  IF EXISTS (SELECT 1 FROM app.estimates WHERE legacy_number = v_est_no) THEN
    RAISE NOTICE 'demo estimate already present; skipping audit demo seed';
    RETURN;
  END IF;

  v_entry_key := v_customer || '__' || v_product || '__PRODUCTION';

  -- 試算
  -- input は完全な TrialInput（lib/trial-pricing.ts）でなければ calcTrialPricing が
  -- lotQuantities.map 等で落ちる。フォーム既定値と同じ完全なスナップショットを入れる。
  INSERT INTO app.estimates
    (legacy_number, name, tool_type, status, customer_bp_id, input, created_by, created_at, updated_at)
  VALUES
    (v_est_no, 'デモ試算 φ3×38', 'ROUND_BAR', 'CONFIRMED', v_customer,
     '{"toolType":"ROUND_BAR","maxDiameter":3,"totalLength":38,"materialBarPrice":1200,"isBlackSkin":false,"cylinderMaterialPrice":0,"cylinderType":"NORMAL","stepLength":0,"stepType":"FINISH","neckLength":0,"neckType":"NONE","coating":"CX400","lapType":"NONE","inspection":"NONE","ldEnabled":false,"ldLocation":"TIP","ldOuterDiameter":3,"ldBladeLength":10,"machiningMinutes":6,"machiningRatePer10min":300,"spareShapeCount":0,"lotQuantities":[100,0,0],"lotMarkups":[1]}'::jsonb,
     v_sys, now(), now())
  RETURNING id INTO v_est_id;

  -- 価格表エントリ + 本番バリアント + 段階（同じ顧客 × 製品が既にあれば作らない）
  IF NOT EXISTS (SELECT 1 FROM app.price_list_entries
                  WHERE customer_bp_id = v_customer AND item_id = v_product) THEN
    INSERT INTO app.price_list_entries
      (legacy_number, customer_bp_id, item_id, currency, is_active,
       created_by, created_at, updated_at)
    VALUES
      (v_prc_no, v_customer, v_product, 'JPY', true, v_sys, now(), now())
    RETURNING id INTO v_entry_id;

    INSERT INTO app.price_list_variants
      (entry_id, order_type, base_unit_price, valid_from,
       estimate_id, is_active, created_at, updated_at)
    VALUES (v_entry_id, 'PRODUCTION', 1000, CURRENT_DATE, v_est_id, true, now(), now());

    INSERT INTO app.price_list_tiers
      (variant_id, min_quantity, max_quantity, multiplier, sort_order)
    SELECT v.id, 1, NULL, 1, 0
    FROM app.price_list_variants v
    WHERE v.entry_id = v_entry_id AND v.order_type = 'PRODUCTION';
  END IF;

  -- 見積書 + 明細
  INSERT INTO app.quotes
    (legacy_number, customer_bp_id, status, created_by, created_at, updated_at)
  VALUES
    (v_qot_no, v_customer, 'DRAFT', v_sys, now(), now())
  RETURNING id INTO v_quote_id;

  INSERT INTO app.quote_items
    (quote_id, item_id, order_type, quantity, unit_price, amount, sort_order)
  VALUES (v_quote_id, v_product, 'PRODUCTION', 100, 1000, 100000, 0);

  -- 履歴（CREATE, actor = システム）— record_id は人が読む番号、record_key は
  -- 書類の参照（doc_ref = `<法人コード>/<番号>`）。
  INSERT INTO app.audit_logs (user_id, action, table_name, record_id, record_key, after_data)
  SELECT v_sys, 'CREATE', 'estimates', e.doc_number, e.doc_ref,
         jsonb_build_object('note', 'デモ試算を作成', 'status', 'CONFIRMED')
    FROM app.estimates e WHERE e.id = v_est_id;

  INSERT INTO app.audit_logs (user_id, action, table_name, record_id, after_data)
  SELECT v_sys, 'CREATE', 'price_list_entries', v_entry_key,
         jsonb_build_object('note', 'デモ価格表を作成', 'baseUnitPrice', 1000)
  WHERE NOT EXISTS (SELECT 1 FROM app.audit_logs WHERE table_name='price_list_entries' AND record_id=v_entry_key);

  INSERT INTO app.audit_logs (user_id, action, table_name, record_id, record_key, after_data)
  SELECT v_sys, 'CREATE', 'quotes', q.doc_number, q.doc_ref,
         jsonb_build_object('note', 'デモ見積書を作成', 'status', 'DRAFT')
    FROM app.quotes q WHERE q.id = v_quote_id;

  -- SEED システムイベント（この投入自体を履歴に残す）
  INSERT INTO app.audit_logs (user_id, action, table_name, record_id, after_data)
  SELECT v_sys, 'SEED', 'system', 'audit-demo-seed',
         jsonb_build_object('note', 'デモデータ投入（試算・価格表・見積書）')
  WHERE NOT EXISTS (SELECT 1 FROM app.audit_logs WHERE action='SEED' AND record_id='audit-demo-seed');
END $$;
