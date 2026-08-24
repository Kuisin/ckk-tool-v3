-- 初期管理者アカウント（ローカルログイン）+ パスワード変更の強制フラグ。
--
-- なぜ要るか: `app.user_permissions` は user_role_relation の素の JOIN なので、
-- ロールが 1 行も無い DB では **全員が無権限**になる。しかもロールを付与できる
-- 画面が無い（SY01 は所属拠点しか編集できない）ため、新規 DB は自力では
-- 管理できない状態で立ち上がっていた。ここで「最初の管理者」を用意して塞ぐ。
--
-- ⚠️ 既定パスワードは `admin`。**初回ログイン時に変更を強制**する
--    （users.password_change_required = true → ダッシュボードが
--     /password-change へ飛ばす）。変更するまで他の画面は開けない。
--    それでも「変更されるまでは既定の資格情報が有効」なので、
--    本番を立ち上げたら**すぐにログインして変えること**。

-- ── 1. パスワード変更の強制フラグ ──────────────────────────────────────────
ALTER TABLE "app"."users"
  ADD COLUMN IF NOT EXISTS "password_change_required" BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN "app"."users"."password_change_required" IS
  'true の間は /password-change 以外を開けない（初期管理者の既定パスワード対策）';

-- ── 2. 初期管理者 ───────────────────────────────────────────────────────────
-- password_hash は lib/password.ts と同じ scrypt 形式（<salt hex>:<hash hex>,
-- N=16384 r=8 p=1 keylen=64）。平文は `admin`。
-- 既に `admin` が居る DB では何もしない（ON CONFLICT DO NOTHING）— 既存環境の
-- パスワードを勝手に戻さないため。
INSERT INTO "app"."users"
  (id, "group", username, display_name, email, is_active,
   password_hash, password_change_required, created_at, updated_at)
VALUES (
  gen_random_uuid(), 'EMPLOYEE', 'admin', '管理者', NULL, true,
  '85d9cba8af916ab6bdb44fd9daeb658f:1b40c1d61b43ab687601d5be6651583a2020d5e23d6ec831a98c7d55a6bcced00b907f8d32b704f10d4c96dbeed2cc911d88976d96475c6ce0b1a92472671dd2',
  true, now(), now()
)
ON CONFLICT (username) DO NOTHING;

-- admin ロールを付与（rolename 'admin' は 0008 で作られている）。
INSERT INTO "app"."user_role_relation" (user_id, role_id, is_active, assigned_at)
SELECT u.id, r.id, true, now()
  FROM "app"."users" u
  JOIN "app"."roles" r ON r.rolename = 'admin'
 WHERE u.username = 'admin'
ON CONFLICT (user_id, role_id) DO UPDATE
  SET is_active = true, deactivate_at = NULL;
