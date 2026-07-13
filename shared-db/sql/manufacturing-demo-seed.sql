-- manufacturing-demo-seed.sql — 製造機能の動作確認用デモ投入（dev 専用・任意）。
--
-- 承認グループ（第一/第二/ワークフロー変更）を作成し、システムユーザーを
-- メンバーに登録する。認証未実装の間は操作 actor が常にシステムユーザーの
-- ため、これで指示書の承認ボタンが押せるようになる。
-- 本番のグループ・メンバーは /master/approval-groups から登録する。
--
-- 冪等: name の ja で存在確認。適用: gunzip 不要 — psql にそのまま流す。
--   cd shared-db && pnpm remote sh -c 'psql "$DATABASE_URL" -f sql/manufacturing-demo-seed.sql'

DO $$
DECLARE
  v_sys uuid := '00000000-0000-0000-0000-000000000000';
  v_gid int;
  v_type text;
  v_name text;
BEGIN
  -- システムユーザーを保証（migration 20260706040000 と同一 UUID）
  INSERT INTO app.users (id, "group", username, display_name, is_active, created_at, updated_at)
  VALUES (v_sys, 'SYSTEM', 'system', 'システム', true, now(), now())
  ON CONFLICT (id) DO NOTHING;

  FOR v_type, v_name IN
    SELECT * FROM (VALUES
      ('FIRST',           '第一承認グループ（デモ）'),
      ('SECOND',          '第二承認グループ（デモ）'),
      ('WORKFLOW_CHANGE', 'ワークフロー変更承認グループ（デモ）')
    ) AS t(typ, nm)
  LOOP
    SELECT id INTO v_gid FROM app.approval_groups WHERE name->>'ja' = v_name;
    IF v_gid IS NULL THEN
      INSERT INTO app.approval_groups (type, name, is_active)
      VALUES (v_type::app."APPROVAL_GROUP_TYPE",
              jsonb_build_object('ja', v_name, 'en', v_name),
              true)
      RETURNING id INTO v_gid;
    END IF;

    INSERT INTO app.approval_group_members (group_id, user_id, is_active)
    VALUES (v_gid, v_sys, true)
    ON CONFLICT (group_id, user_id) DO NOTHING;
  END LOOP;

  -- 投入自体を履歴に残す
  INSERT INTO app.audit_logs (user_id, action, table_name, record_id, after_data)
  SELECT v_sys, 'SEED', 'system', 'manufacturing-demo-seed',
         jsonb_build_object('note', '製造デモ投入（承認グループ×3 + システムユーザー登録）')
  WHERE NOT EXISTS (
    SELECT 1 FROM app.audit_logs
    WHERE table_name = 'system' AND record_id = 'manufacturing-demo-seed'
  );
END $$;
