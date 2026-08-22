-- 通貨レートの基準を「100 円」に変更。
--
-- 旧: rate_to_jpy   = 1 通貨単位あたりの円（JPY = 1、USD ≒ 159）
-- 新: rate_per_100_jpy = 100 円で買えるその通貨の量（JPY = 100、USD ≒ 0.6291、VND ≒ 16,435）
-- 変換: 新値 = 100 / 旧値。列単位 GRANT（fx_rates ロール）は列に付くので rename に追従する。
--   円へ:   amount_jpy = amount × 100 / rate_per_100_jpy
--   通貨間: amount_in_to = amount × to.rate / from.rate

ALTER TABLE "app"."currencies" RENAME COLUMN "rate_to_jpy" TO "rate_per_100_jpy";

UPDATE "app"."currencies"
SET "rate_per_100_jpy" = round(100 / "rate_per_100_jpy", 6), "updated_at" = now()
WHERE "rate_per_100_jpy" > 0;
