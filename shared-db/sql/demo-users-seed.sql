-- demo-users-seed.sql — SSO なしで使う 5 デモユーザー（password: demo2026）。
-- 冪等: username で upsert。承認グループ（デモ）へのメンバー登録込み:
--   demo1 = 第一+第二+WF変更 / demo3 = 第一 / demo2 = 第二。
-- 適用: cd shared-db && pnpm remote sh -c 'psql "$DATABASE_URL" -f sql/demo-users-seed.sql'

DO $$
DECLARE
  v_id uuid;
  v_first int;
  v_second int;
  v_wf int;
  r record;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
    ('demo1', '田中 一郎（管理）', 'ed25b159863569070c26f7f463b63139:9d0839d0f061acc2ff61b99256350fed91191135b38f06a9aac844df51a5dd853e6b80e55b418fc71b4942a457b02062f360882f89681b12f72644e82788bcc1'),
    ('demo2', '鈴木 二郎（営業）', '4b527e6403a8cd1ccb3da1be619994a5:8c599c8c7858dc62f87669a781b28b25bd37c90c939da9b6777fe770a2d6bfc67f9d8dac45afafaf9ed6009d9c158751e425d619225943b09e5d3070043c559b'),
    ('demo3', '佐藤 三郎（製造）', '675ec4e1a8eedb385753e19f495e7bc9:297bfb1f6f522aeb322e09fad77c57cacbc380edcdfabd373a4ea6ef31b429d974f36cd4db869dc9b27d4cace31078fd7da4e8e24d2fdfbc3b15bc9442652de2'),
    ('demo4', '高橋 四子（検査）', '0b6ee8749cf52f854a1caed188db38fb:a32f76ca74c39b4f006a4e02b283a17e85b7ec7f0855305428217a8b5948bcbf4919dfc8671bb29046a236c3acc19533ac4db02f9753e73c84aa22d79f3c9845'),
    ('demo5', '伊藤 五月（出荷）', '6415b36ecb6279629c72fe244ec511c8:a1dfdaa704bd452d036996f1db5b04f2babd6bbcfba456874af8e152eb6a838bf4c54cfcf2e7a32d9ff1604f345b14bd63f0c9e5c7b28f8f3e673d03984354b1')
    ) AS t(username, display_name, password_hash)
  LOOP
    INSERT INTO app.users (id, "group", username, display_name, password_hash, is_active, created_at, updated_at)
    VALUES (gen_random_uuid(), 'EMPLOYEE', r.username, r.display_name, r.password_hash, true, now(), now())
    ON CONFLICT (username) DO UPDATE SET
      display_name = EXCLUDED.display_name,
      password_hash = EXCLUDED.password_hash,
      is_active = true,
      updated_at = now();
  END LOOP;

  SELECT id INTO v_first  FROM app.approval_groups WHERE type = 'FIRST'  AND is_active LIMIT 1;
  SELECT id INTO v_second FROM app.approval_groups WHERE type = 'SECOND' AND is_active LIMIT 1;
  SELECT id INTO v_wf     FROM app.approval_groups WHERE type = 'WORKFLOW_CHANGE' AND is_active LIMIT 1;

  SELECT id INTO v_id FROM app.users WHERE username = 'demo1';
  IF v_first  IS NOT NULL THEN INSERT INTO app.approval_group_members (group_id, user_id, is_active) VALUES (v_first,  v_id, true) ON CONFLICT DO NOTHING; END IF;
  IF v_second IS NOT NULL THEN INSERT INTO app.approval_group_members (group_id, user_id, is_active) VALUES (v_second, v_id, true) ON CONFLICT DO NOTHING; END IF;
  IF v_wf     IS NOT NULL THEN INSERT INTO app.approval_group_members (group_id, user_id, is_active) VALUES (v_wf,     v_id, true) ON CONFLICT DO NOTHING; END IF;

  SELECT id INTO v_id FROM app.users WHERE username = 'demo3';
  IF v_first  IS NOT NULL THEN INSERT INTO app.approval_group_members (group_id, user_id, is_active) VALUES (v_first,  v_id, true) ON CONFLICT DO NOTHING; END IF;

  SELECT id INTO v_id FROM app.users WHERE username = 'demo2';
  IF v_second IS NOT NULL THEN INSERT INTO app.approval_group_members (group_id, user_id, is_active) VALUES (v_second, v_id, true) ON CONFLICT DO NOTHING; END IF;
END $$;
