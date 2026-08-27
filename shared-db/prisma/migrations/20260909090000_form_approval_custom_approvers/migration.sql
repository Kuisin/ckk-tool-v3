-- カスタム段の承認者を 1 人 → 複数人にする。
--
-- 「この稟議は部長と経理の 2 人が見る」程度の段が多く、そのたびに承認グループを
-- 作るとグループ一覧が使い捨てで埋まって読めなくなる。段に直接 1..N 人を指せる
-- ようにして、承認モード（いずれか 1 名 / 全員）も効くようにする。
--
-- 「カスタムなら承認者が 1 人以上」は表をまたぐので CHECK では書けない。
-- 書き込み口（saveFormApprovalFlow）で守り、依頼時にも承認者ゼロの段があれば
-- 止める（誰も押せない依頼を作らない）。
CREATE TABLE IF NOT EXISTS "app"."form_approval_step_approvers" (
  "step_id"    UUID    NOT NULL,
  "user_id"    UUID    NOT NULL,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "form_approval_step_approvers_pkey" PRIMARY KEY ("step_id", "user_id")
);

DO $$ BEGIN
  ALTER TABLE "app"."form_approval_step_approvers"
    ADD CONSTRAINT "form_approval_step_approvers_step_id_fkey"
    FOREIGN KEY ("step_id") REFERENCES "app"."form_approval_steps"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "app"."form_approval_step_approvers"
    ADD CONSTRAINT "form_approval_step_approvers_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "app"."users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "form_approval_step_approvers_user_id_idx"
  ON "app"."form_approval_step_approvers" ("user_id");

-- 既存の 1 人指名を移す（列を落とす前に）。
INSERT INTO "app"."form_approval_step_approvers" ("step_id", "user_id", "sort_order")
SELECT "id", "approver_user_id", 0
FROM "app"."form_approval_steps"
WHERE "approver_user_id" IS NOT NULL
ON CONFLICT DO NOTHING;

-- 単一指名の名残を落とす。CHECK は「グループか個人のどちらか一方」だったので
-- 一緒に外す（カスタムは別表で表すため、1 表では書けない）。
ALTER TABLE "app"."form_approval_steps"
  DROP CONSTRAINT IF EXISTS "form_approval_steps_target_one_of";
ALTER TABLE "app"."form_approval_steps"
  DROP COLUMN IF EXISTS "approver_user_id";
