-- 指示書の書類番号 WO-YYYYMM-NNNNN（月次リセット — 他書類と同形式）。
--
-- work_order_number（通し連番 = ロット番号）はそのまま残す — 在庫ロット・
-- QR（CKK:WO:<n>）・承認/メモ/監査の業務キー・キオスクはこちらを使い続ける。
-- 新しい year_month + seq は**表示用の書類番号**で、既存行は作成月（JST）
-- ごとに work_order_number 順で連番を振って埋める。
-- 採番は numbering_sequences のキー WORK_ORDER_DOC（既存の WORK_ORDER は
-- 通し連番用 — キーを分けないと月次リセットの upsert が通し連番を壊す）。

ALTER TABLE "app"."work_orders"
  ADD COLUMN "year_month" CHAR(6),
  ADD COLUMN "seq" INTEGER;

-- 作成月（JST）× work_order_number 順で 1..N を採番して埋める
WITH numbered AS (
  SELECT id,
         to_char(created_at AT TIME ZONE 'Asia/Tokyo', 'YYYYMM') AS ym,
         row_number() OVER (
           PARTITION BY to_char(created_at AT TIME ZONE 'Asia/Tokyo', 'YYYYMM')
           ORDER BY work_order_number
         ) AS rn
  FROM "app"."work_orders"
)
UPDATE "app"."work_orders" w
SET "year_month" = n.ym, "seq" = n.rn
FROM numbered n
WHERE w.id = n.id;

ALTER TABLE "app"."work_orders"
  ALTER COLUMN "year_month" SET NOT NULL,
  ALTER COLUMN "seq" SET NOT NULL;

CREATE UNIQUE INDEX "work_orders_year_month_seq_key"
  ON "app"."work_orders"("year_month", "seq");

-- 採番シーケンスを既存データへ追従（最新月の最大 seq から続きを振る）
INSERT INTO "app"."numbering_sequences" ("key", "prefix", "last_year_month", "last_sequence", "updated_at")
SELECT 'WORK_ORDER_DOC', 'WO', w."year_month", MAX(w."seq"), now()
FROM "app"."work_orders" w
WHERE w."year_month" = (SELECT MAX("year_month") FROM "app"."work_orders")
GROUP BY w."year_month"
ON CONFLICT ("key") DO UPDATE
  SET "last_year_month" = EXCLUDED."last_year_month",
      "last_sequence" = GREATEST("app"."numbering_sequences"."last_sequence", EXCLUDED."last_sequence"),
      "updated_at" = EXCLUDED."updated_at";
