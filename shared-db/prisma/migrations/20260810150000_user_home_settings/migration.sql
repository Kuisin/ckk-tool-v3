-- ホーム画面カスタマイズ（ユーザー別設定）
--
-- 1 行 = 1 ユーザー。行が無ければ既定表示（カテゴリ別・お気に入りなし）。
-- starred = お気に入りアプリ key の配列 / groups = カスタムグループ
-- [{ name, apps: string[] }]（mode=custom 時に使用）。

CREATE TABLE "app"."user_home_settings" (
    "user_id" UUID NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'default',
    "starred" JSONB NOT NULL DEFAULT '[]',
    "groups" JSONB NOT NULL DEFAULT '[]',
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "user_home_settings_pkey" PRIMARY KEY ("user_id")
);

ALTER TABLE "app"."user_home_settings"
  ADD CONSTRAINT "user_home_settings_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "app"."users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
