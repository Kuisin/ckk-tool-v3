-- 指示書の承認状態を段数非依存にする
--
-- WORK_ORDER_APPROVAL_STATUS は PENDING_1ST / APPROVED_1ST / PENDING_2ND と
-- 2 段固定を enum に焼き込んでいた唯一の箇所。承認が N 段になるので
-- 「進行中（PENDING）」に畳み、何段目かは approval_requests.step_no が持つ。
--
-- 他 3 書類（注文請書・素材発注書・購買依頼）は REQUESTED =「承認フロー
-- 進行中（何段目でも）」と読めるので enum の変更は要らない。
--
-- 段ごとの日時も approval_requests / approval_records に正規化済みなので、
-- requested_1st_* / approved_1st_* / approved_2nd_* の 1st/2nd 分けをやめて
-- material_purchase_orders / purchase_requests と同じ形（requested_* /
-- approved_*）に揃える。

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. approval_status の enum を作り直す
--    （enum は値を削除できないので rename → 作成 → USING で移送 → 旧を破棄）
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TYPE "app"."WORK_ORDER_APPROVAL_STATUS" RENAME TO "WORK_ORDER_APPROVAL_STATUS_old";

CREATE TYPE "app"."WORK_ORDER_APPROVAL_STATUS" AS ENUM ('NONE', 'PENDING', 'APPROVED', 'REJECTED');

ALTER TABLE "app"."work_orders" ALTER COLUMN "approval_status" DROP DEFAULT;

ALTER TABLE "app"."work_orders"
  ALTER COLUMN "approval_status" TYPE "app"."WORK_ORDER_APPROVAL_STATUS"
  USING (
    CASE "approval_status"::text
      WHEN 'PENDING_1ST'  THEN 'PENDING'
      WHEN 'APPROVED_1ST' THEN 'PENDING'
      WHEN 'PENDING_2ND'  THEN 'PENDING'
      ELSE "approval_status"::text
    END
  )::"app"."WORK_ORDER_APPROVAL_STATUS";

ALTER TABLE "app"."work_orders" ALTER COLUMN "approval_status" SET DEFAULT 'NONE';

DROP TYPE "app"."WORK_ORDER_APPROVAL_STATUS_old";

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. 承認遷移列を段数非依存の形へ
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE "app"."work_orders" RENAME COLUMN "requested_1st_at" TO "requested_at";
ALTER TABLE "app"."work_orders" RENAME COLUMN "requested_1st_by" TO "requested_by";

-- 既存の requested_by / rejected_by と同じく FK は張らない
-- （承認者が退職・削除されても履歴として残す。実体の記録は approval_records）。
ALTER TABLE "app"."work_orders" ADD COLUMN "approved_by" UUID;

-- 最終承認の実績を新しい列へ寄せてから 1st/2nd 列を落とす
UPDATE "app"."work_orders"
SET "approved_at" = COALESCE("approved_at", "approved_2nd_at"),
    "approved_by" = "approved_2nd_by";

ALTER TABLE "app"."work_orders"
  DROP COLUMN "approved_1st_at",
  DROP COLUMN "approved_1st_by",
  DROP COLUMN "approved_2nd_at",
  DROP COLUMN "approved_2nd_by";
