-- 価格試算の種別（原価試算 / 売価試算）
--
-- COST = 原価試算: 原価合計だけを出す価格試算。権限 estimate_cost を持つ人にしか
--   見えず（一覧・詳細ともサーバー側で行ごと落とす）、価格表の基準単価ソースには
--   できない。
-- PRICE = 売価試算: 従来の価格試算（見積単価まで出す）。既存行はすべてこれ。
--
-- ローリングデプロイ: 型と列を足すだけ（既定 PRICE）。旧アプリは列を知らないので
-- 作る行はすべて PRICE になり、従来どおりの動き。

CREATE TYPE "app"."ESTIMATE_KIND" AS ENUM ('COST', 'PRICE');

ALTER TABLE "app"."estimates"
  ADD COLUMN "kind" "app"."ESTIMATE_KIND" NOT NULL DEFAULT 'PRICE';
