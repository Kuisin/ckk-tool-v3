-- 共有に「この条件に当てはまる回答だけ見せる」を足す。
--
-- 権限コード（form）は「アプリを使えるか」、共有行は「このフォームを見せるか」
-- までしか決められず、「このフォームの “どの回答” を見せるか」を表現できなかった。
-- 拠点やロールに配ったときに全件見えてしまうので、行に条件を持たせる。
--
-- 意味を持つのは READ の共有だけ（EDIT/MANAGE はフォームを預かる側なので絞らない）。
-- condition_field_key が NULL = 絞り込みなし＝全件、という既定に倒してあるので、
-- 既存行は挙動が変わらない。
ALTER TABLE "app"."share_grants"
  ADD COLUMN IF NOT EXISTS "condition_field_key" TEXT,
  ADD COLUMN IF NOT EXISTS "condition_values" TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS "condition_labels" TEXT[] NOT NULL DEFAULT '{}';
