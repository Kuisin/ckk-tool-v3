-- ユーザーの利用停止（一時 / 恒久）。
--
-- 既存の `is_active` は「いま使えるか」の唯一のゲートで、user_permissions ビューも
-- 認証も既にこれを見ている。**そこは変えない** — 変えると権限判定の入口が 2 つに
-- なって、片方だけ直す事故が起きる。ここで足すのは「なぜ / いつまで止めたか」だけ。
--
--   disabled_until IS NULL      … 恒久停止（手で戻すまで戻らない）
--   disabled_until = 日時       … 一時停止（その日時を過ぎたら自動で戻す）
--
-- 自動復帰は pg_cron（sql/user-suspension-cron.sql）が毎分戻す。判定を
-- 「is_active AND (disabled_until <= now())」のような式にしなかったのは、
-- その式を認証・ビュー・アプリの全箇所へ配る必要が出るため。フラグ 1 本に
-- 寄せて、時間で戻す係を 1 つ置くほうが壊れにくい（最大 1 分の遅れは許容）。

ALTER TABLE "app"."users"
  ADD COLUMN IF NOT EXISTS "disabled_until"  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "disabled_reason" TEXT,
  ADD COLUMN IF NOT EXISTS "disabled_at"     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "disabled_by"     UUID;

COMMENT ON COLUMN "app"."users"."disabled_until" IS
  '一時停止の解除予定日時。NULL かつ is_active=false は恒久停止。過ぎると pg_cron が is_active を戻す';
COMMENT ON COLUMN "app"."users"."disabled_reason" IS '停止理由（監査・本人説明用）';
COMMENT ON COLUMN "app"."users"."disabled_at" IS '停止した日時';
COMMENT ON COLUMN "app"."users"."disabled_by" IS '停止した操作者（app.users.id）';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_disabled_by_fkey'
  ) THEN
    ALTER TABLE "app"."users"
      ADD CONSTRAINT "users_disabled_by_fkey"
      FOREIGN KEY ("disabled_by") REFERENCES "app"."users"("id") ON DELETE SET NULL;
  END IF;
END $$;

-- 有効なのに解除予定が残っている行は矛盾（戻し忘れ / 手作業の跡）。
-- 復帰係が毎分見るのはこの条件の裏返しなので、DB 側でも整合を強制しておく。
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_suspension_consistent'
  ) THEN
    ALTER TABLE "app"."users"
      ADD CONSTRAINT "users_suspension_consistent"
      CHECK ("is_active" = false OR "disabled_until" IS NULL);
  END IF;
END $$;

-- 復帰係が毎分引く索引（対象はごく少数なので部分索引）。
CREATE INDEX IF NOT EXISTS "users_disabled_until_idx"
  ON "app"."users" ("disabled_until")
  WHERE "disabled_until" IS NOT NULL;
