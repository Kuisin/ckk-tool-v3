-- 価格表の識別に発行会社（自社法人）を足す。
--
-- 価格表は**会社ごとに別々**に持つ（同じ顧客 × 品目でも、発行会社ごとに別の
-- 値段が付きうる）。これまでの識別は (顧客, 品目, 工具) で、2 社目が同じ
-- 顧客 × 品目の価格表を作ろうとすると一意制約で断られていた。識別を
-- (発行会社, 顧客, 品目, 工具) へ広げる。
--
-- 価格の解決（見積書・注文請書・出荷の引き直し）も**書類の発行会社の価格表だけ**
-- を引く（アプリ側 — components/sales/price-lists/model.ts entriesForCompany）。
--
-- 工具は null を 1 つの値として数えるので、20261126140000_price_list_tool_item と
-- 同じく「工具なし」「工具あり」の 2 本の部分 unique index に割る（Prisma は
-- 部分 unique を表現できないので schema には書かない）。
--
-- 既存の行は (顧客, 品目, 工具) ごとに 1 行だけなので、列を足した索引でも
-- 重複は生まれない — 置き換えは一意性を緩めるだけで、既存データで失敗しない。
-- allow-destructive: 一意索引を張り直すだけ（列もデータも消さない）。新しい索引は旧索引より緩いので、旧アプリの書き込みは全部通る。

DROP INDEX "app"."price_list_entries_customer_item_no_tool_key";
DROP INDEX "app"."price_list_entries_customer_item_tool_key";

CREATE UNIQUE INDEX "price_list_entries_company_customer_item_no_tool_key"
  ON "app"."price_list_entries"("own_company_id", "customer_bp_id", "item_id")
  WHERE "tool_item_id" IS NULL;

CREATE UNIQUE INDEX "price_list_entries_company_customer_item_tool_key"
  ON "app"."price_list_entries"("own_company_id", "customer_bp_id", "item_id", "tool_item_id")
  WHERE "tool_item_id" IS NOT NULL;
