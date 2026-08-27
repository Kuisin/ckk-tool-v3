-- フォームの承認フローを「フォームごと」に持たせる。
--
-- 書類共通の approval_flow_steps は **書類種別ごとに 1 本**（target_type が主キー）
-- で、「注文請書はこの承認」という単位でしか表現できない。フォームは利用者が
-- いくつでも作るもので、稟議・日報・点検簿が同じ承認フローを共有する理由がない。
-- 設定場所も 承認設定(MS0B) からフォームの「承認」タブへ移す。
--
-- 進行中の承認依頼は影響を受けない — 依頼時に flow_snapshot へ写しているため
-- （共通フローと同じ扱い）。
CREATE TABLE IF NOT EXISTS "app"."form_approval_steps" (
  "id"         UUID         NOT NULL DEFAULT gen_random_uuid(),
  "form_id"    UUID         NOT NULL,
  "step_no"    INTEGER      NOT NULL,
  "name"       JSONB        NOT NULL,
  "group_id"   INTEGER      NOT NULL,
  "mode"       "app"."APPROVAL_MODE" NOT NULL DEFAULT 'ANY',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "form_approval_steps_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  ALTER TABLE "app"."form_approval_steps"
    ADD CONSTRAINT "form_approval_steps_form_id_fkey"
    FOREIGN KEY ("form_id") REFERENCES "app"."forms"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- グループは Restrict — 使われている承認グループを消せてしまうと、
-- 段の宛先が消えたフローが残る。
DO $$ BEGIN
  ALTER TABLE "app"."form_approval_steps"
    ADD CONSTRAINT "form_approval_steps_group_id_fkey"
    FOREIGN KEY ("group_id") REFERENCES "app"."approval_groups"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "form_approval_steps_form_id_step_no_key"
  ON "app"."form_approval_steps" ("form_id", "step_no");
CREATE INDEX IF NOT EXISTS "form_approval_steps_group_id_idx"
  ON "app"."form_approval_steps" ("group_id");

-- 承認依頼中の編集可否。既定 false = 依頼した時点で締める（従来どおり）。
-- true にすると「最初の承認が下りるまで」は本人が直せる。
ALTER TABLE "app"."forms"
  ADD COLUMN IF NOT EXISTS "editable_until_first_approval" BOOLEAN NOT NULL DEFAULT false;
