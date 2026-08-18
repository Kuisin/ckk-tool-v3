-- manufacturing-demo-seed.sql — 製造機能の動作確認用デモ投入（dev 専用・任意）。
--
-- 承認グループを作成してシステムユーザーをメンバーに登録し、4 書類ぶんの
-- 承認フロー（どの段でどのグループを使うか）を投入する。認証未実装の間は
-- 操作 actor が常にシステムユーザーのため、これで承認ボタンが押せるようになる。
-- 本番のグループ・フローは /master/approval-settings から設定する。
--
-- 冪等: name の ja で存在確認。適用: gunzip 不要 — psql にそのまま流す。
--   cd shared-db && pnpm remote sh -c 'psql "$DATABASE_URL" -f sql/manufacturing-demo-seed.sql'

DO $$
DECLARE
  v_sys uuid := '00000000-0000-0000-0000-000000000000';
  v_gid int;
  v_name text;
  v_first int;
  v_second int;
BEGIN
  -- システムユーザーを保証（migration 20260706040000 と同一 UUID）
  INSERT INTO app.users (id, "group", username, display_name, is_active, created_at, updated_at)
  VALUES (v_sys, 'SYSTEM', 'system', 'システム', true, now(), now())
  ON CONFLICT (id) DO NOTHING;

  FOR v_name IN
    SELECT * FROM (VALUES
      ('第一承認グループ（デモ）'),
      ('第二承認グループ（デモ）')
    ) AS t(nm)
  LOOP
    SELECT id INTO v_gid FROM app.approval_groups WHERE name->>'ja' = v_name;
    IF v_gid IS NULL THEN
      INSERT INTO app.approval_groups (name, is_active)
      VALUES (jsonb_build_object('ja', v_name, 'en', v_name), true)
      RETURNING id INTO v_gid;
    END IF;

    INSERT INTO app.approval_group_members (group_id, user_id, is_active)
    VALUES (v_gid, v_sys, true)
    ON CONFLICT (group_id, user_id) DO NOTHING;
  END LOOP;

  -- 承認フロー: 指示書は 2 段、他 3 書類は 1 段（いずれも「いずれか 1 名」）
  SELECT id INTO v_first  FROM app.approval_groups WHERE name->>'ja' = '第一承認グループ（デモ）';
  SELECT id INTO v_second FROM app.approval_groups WHERE name->>'ja' = '第二承認グループ（デモ）';

  INSERT INTO app.approval_flows (target_type, updated_at)
  VALUES ('work_orders', now()), ('order_acceptances', now()),
         ('material_purchase_orders', now()), ('purchase_requests', now())
  ON CONFLICT (target_type) DO NOTHING;

  INSERT INTO app.approval_flow_steps (target_type, step_no, name, group_id, mode) VALUES
    ('work_orders',              1, jsonb_build_object('ja', '第一承認', 'en', 'First approval'),  v_first,  'ANY'),
    ('work_orders',              2, jsonb_build_object('ja', '第二承認', 'en', 'Second approval'), v_second, 'ANY'),
    ('order_acceptances',        1, jsonb_build_object('ja', '第一承認', 'en', 'First approval'),  v_first,  'ANY'),
    ('material_purchase_orders', 1, jsonb_build_object('ja', '第一承認', 'en', 'First approval'),  v_first,  'ANY'),
    ('purchase_requests',        1, jsonb_build_object('ja', '第一承認', 'en', 'First approval'),  v_first,  'ANY')
  ON CONFLICT (target_type, step_no) DO NOTHING;

  -- 投入自体を履歴に残す
  INSERT INTO app.audit_logs (user_id, action, table_name, record_id, after_data)
  SELECT v_sys, 'SEED', 'system', 'manufacturing-demo-seed',
         jsonb_build_object('note', '製造デモ投入（承認グループ×3 + システムユーザー登録）')
  WHERE NOT EXISTS (
    SELECT 1 FROM app.audit_logs
    WHERE table_name = 'system' AND record_id = 'manufacturing-demo-seed'
  );
END $$;
