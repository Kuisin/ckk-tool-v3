-- screenshot-user-seed.sql — マニュアル用スクリーンショット撮影ユーザー（password: shot2026）。
-- tools/docs-screenshots のパイプラインがローカル一時 DB でログインに使う。冪等。
-- 固定 UUID — 画面に id が出るケースでも撮り直しでピクセルが変わらないようにする。
-- ロールは staff（system/kiosk 以外の全アプリ READ — 撮影対象を広く回れる。管理者ではない）。
-- 適用（ローカル一時 DB）: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f sql/screenshot-user-seed.sql

BEGIN;

INSERT INTO app.users (id, "group", username, display_name, password_hash, is_active, created_at, updated_at)
VALUES (
  'a0b1c2d3-0000-4000-8000-000000005107',
  'EMPLOYEE'::app."USER_GROUP",
  'demo_shot',
  '撮影 太郎',
  'c10dd14625bf8dad318f281d65509648:e1adef0667aeab0034eb6ea150c103d45f36e328ded6a888f78d2597989e9dc2836c079ab55ac74e147b0bbc97c23bc370f6fe92c3d5062fe9aacbc2dec8d2f7',
  true, now(), now()
)
ON CONFLICT (username) DO UPDATE SET password_hash = EXCLUDED.password_hash, display_name = EXCLUDED.display_name, is_active = true;

INSERT INTO app.user_role_relation (user_id, role_id, is_active, assigned_at)
SELECT u.id, r.id, true, now()
FROM app.users u JOIN app.roles r ON r.rolename = 'staff'
WHERE u.username = 'demo_shot'
ON CONFLICT (user_id, role_id) DO UPDATE SET is_active = true, deactivate_at = NULL;

COMMIT;
