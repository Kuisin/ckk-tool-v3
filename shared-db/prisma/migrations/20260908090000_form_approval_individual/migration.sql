-- フォームの承認段を「承認グループ or 個人」のどちらでも指せるようにする。
--
-- フォームだと「この稟議は部長ひとりが見る」のようにグループを作るまでもない段が
-- 多い。1 人だけの承認グループを作らせると、承認グループ一覧が使い捨てのグループで
-- 埋まって読めなくなるので、段から直接ユーザーを指せるようにする。
--
-- **どちらか一方**しか入らない（CHECK）。両方入ると「誰が承認するのか」が
-- 2 通りに読めてしまい、承認枠のスナップショットも作れない。
ALTER TABLE "app"."form_approval_steps"
  ADD COLUMN IF NOT EXISTS "approver_user_id" UUID;

ALTER TABLE "app"."form_approval_steps"
  ALTER COLUMN "group_id" DROP NOT NULL;

DO $$ BEGIN
  ALTER TABLE "app"."form_approval_steps"
    ADD CONSTRAINT "form_approval_steps_approver_user_id_fkey"
    FOREIGN KEY ("approver_user_id") REFERENCES "app"."users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- グループか個人のどちらか一方（両方 NULL も両方指定も不可）。
DO $$ BEGIN
  ALTER TABLE "app"."form_approval_steps"
    ADD CONSTRAINT "form_approval_steps_target_one_of"
    CHECK (("group_id" IS NULL) <> ("approver_user_id" IS NULL));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "form_approval_steps_approver_user_id_idx"
  ON "app"."form_approval_steps" ("approver_user_id");
