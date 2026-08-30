-- 申請・報告（フォーム CM02 の REQUEST）が完了したときの通知。
--
-- 完了 = 承認フローを使うフォームなら全段承認、使わないフォームなら提出。
-- 「誰に知らせるか」を専用の宛先表にせず **共有設定の行**（share_grants）に
-- 載せるのは、通知先が必ずその回答を読める人であってほしいため。別表にすると
-- 「通知は届くのに開くと notFound」を作れてしまう。条件付き共有もそのまま効く。
--
-- RESPOND（回答だけできる共有）は他人の回答を読めないので、アプリ側の
-- 書き込み口がこのフラグを落とす（DB では表現できない — 列の CHECK では
-- 将来の権限追加に耐えないため、意図はここに書いて実装で守る）。
ALTER TABLE "app"."share_grants"
  ADD COLUMN "notify_on_complete" BOOLEAN NOT NULL DEFAULT false;

-- 「どの回答の完了を、誰に届けたか」の台帳。
--
-- notifications（ベル・メール・プッシュ）とは役割が違う。あちらは全機能が
-- 共有する流れる通知で、対象書類を指す列が無い（linkPath の文字列だけ）ので、
-- 「自分宛の完了した申請」を一覧にできない。ここは対象を列で持つ台帳で、
-- CM01 の一覧・未読の印・二重送信の防止をこの 1 表で賄う。
--
-- read_at は「確認しました」ボタンではなく、その回答を開いた時刻（受け身の既読）。
CREATE TABLE "app"."form_completion_notices" (
  "id"              UUID           NOT NULL DEFAULT gen_random_uuid(),
  "response_number" TEXT           NOT NULL,
  "user_id"         UUID           NOT NULL,
  "notified_at"     TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "read_at"         TIMESTAMPTZ(6),

  CONSTRAINT "form_completion_notices_pkey" PRIMARY KEY ("id")
);

-- 1 回答につき 1 人 1 行。二重送信の防止はこの制約が最終防衛線。
CREATE UNIQUE INDEX "form_completion_notices_response_number_user_id_key"
  ON "app"."form_completion_notices" ("response_number", "user_id");

-- CM01 の一覧（自分宛を新しい順）。
CREATE INDEX "form_completion_notices_user_id_notified_at_idx"
  ON "app"."form_completion_notices" ("user_id", "notified_at" DESC);

ALTER TABLE "app"."form_completion_notices"
  ADD CONSTRAINT "form_completion_notices_response_number_fkey"
  FOREIGN KEY ("response_number") REFERENCES "app"."form_responses"("response_number")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "app"."form_completion_notices"
  ADD CONSTRAINT "form_completion_notices_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "app"."users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
