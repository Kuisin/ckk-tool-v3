-- 設計図 (SA06 / MS24): 版を「製品 × 受注元」ごとに数え、依頼を経ない版と
-- 指示書へのピン留めを持てるようにする。
--
-- ここまでの design_files は「製品ごとに 1 本の版系列」だった。実務では同じ
-- 製品でも顧客ごとに図面が違い、別々に改訂されていく。製品工程ルート
-- （product_process_routes.customer_bp_id）が既に同じ形をしているので、
-- **同じ規約に揃える** — null = 汎用、顧客一致を優先し無ければ汎用へ落ちる。
--
-- 併せて:
--   * design_requests.customer_bp_id … 完成した版がどの系列に載るか
--   * work_orders.design_file_id     … 使用する図面の版（任意のピン留め）
--
-- 「依頼から / 手動」の別は design_request_id の有無から導く（列は増やさない）。

-- ─── 列の追加 ────────────────────────────────────────────────────────────────
ALTER TABLE "app"."design_files"
  ADD COLUMN "customer_bp_id" uuid;

ALTER TABLE "app"."design_requests"
  ADD COLUMN "customer_bp_id" uuid;

ALTER TABLE "app"."work_orders"
  ADD COLUMN "design_file_id" uuid;

-- ─── 既存行の埋め戻し ────────────────────────────────────────────────────────
-- 既存の版は受注元が判らないので **汎用（NULL）のまま**にする。顧客別に
-- 振り分けられる情報が無いのに勝手に紐づけると、他の顧客の指示書から
-- 見えなくなる（汎用なら全員から見える方に倒れる）。
--
-- 依頼側は、見積・注文明細から辿れる顧客を既定として入れておく。こちらは
-- 「その依頼が誰のための図面か」が確定情報として残っているので埋めてよい。
UPDATE "app"."design_requests" dr
   SET "customer_bp_id" = q."customer_bp_id"
  FROM "app"."quotes" q
 WHERE dr."quote_year_month" = q."year_month"
   AND dr."quote_seq" = q."seq"
   AND dr."customer_bp_id" IS NULL;

UPDATE "app"."design_requests" dr
   SET "customer_bp_id" = oa."customer_bp_id"
  FROM "app"."order_lines" ol
  JOIN "app"."order_acceptances" oa
    ON oa."year_month" = ol."acceptance_year_month"
   AND oa."seq" = ol."acceptance_seq"
 WHERE dr."order_line_id" = ol."id"
   AND dr."customer_bp_id" IS NULL;

-- 版番号の振り直し。これまで version は **依頼ごと**に数えていた（完了 1 回で
-- 必ず 1）ので、同じ製品に v1 が何本も並びうる状態だった。新しい規約
-- （系列 = 製品 × 受注元 ごとの連番）に合わせてここで数え直す。
--
-- 1 回の完了で上がったファイルは同じ版を共有するので、行ではなく
-- **グループ**（依頼、依頼が無い行は行そのもの）に番号を振る。
WITH grp AS (
  SELECT COALESCE("design_request_id"::text, "id"::text) AS gkey,
         "product_id",
         "customer_bp_id",
         MIN("created_at") AS first_at
    FROM "app"."design_files"
   GROUP BY 1, 2, 3
), ranked AS (
  SELECT gkey,
         DENSE_RANK() OVER (
           PARTITION BY "product_id", "customer_bp_id"
           ORDER BY first_at, gkey
         ) AS v
    FROM grp
)
UPDATE "app"."design_files" df
   SET "version" = ranked.v
  FROM ranked
 WHERE COALESCE(df."design_request_id"::text, df."id"::text) = ranked.gkey;

-- is_latest を系列ごとに引き直す（系列内で最大の版だけが最新）。
WITH top AS (
  SELECT "product_id", "customer_bp_id", MAX("version") AS v
    FROM "app"."design_files"
   GROUP BY 1, 2
)
UPDATE "app"."design_files" df
   SET "is_latest" = (df."version" = top.v)
  FROM top
 WHERE df."product_id" IS NOT DISTINCT FROM top."product_id"
   AND df."customer_bp_id" IS NOT DISTINCT FROM top."customer_bp_id";

-- ─── 外部キー ────────────────────────────────────────────────────────────────
ALTER TABLE "app"."design_files" ADD CONSTRAINT "design_files_customer_bp_id_fkey"
  FOREIGN KEY ("customer_bp_id") REFERENCES "app"."business_partners"("id")
  ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE "app"."design_requests" ADD CONSTRAINT "design_requests_customer_bp_id_fkey"
  FOREIGN KEY ("customer_bp_id") REFERENCES "app"."business_partners"("id")
  ON UPDATE CASCADE ON DELETE SET NULL;

-- 図面の版を消しても指示書は残す（作り終えた指示書が版の都合で消えるのは困る）。
ALTER TABLE "app"."work_orders" ADD CONSTRAINT "work_orders_design_file_id_fkey"
  FOREIGN KEY ("design_file_id") REFERENCES "app"."design_files"("id")
  ON UPDATE CASCADE ON DELETE SET NULL;

-- ─── 索引 ────────────────────────────────────────────────────────────────────
-- 系列の最新図面を引く。product_id 前方一致で「この製品の全系列」も足りる。
DROP INDEX IF EXISTS "app"."design_files_product_id_is_latest_role_idx";
CREATE INDEX "design_files_product_id_customer_bp_id_is_latest_role_idx"
  ON "app"."design_files" ("product_id", "customer_bp_id", "is_latest", "role");
