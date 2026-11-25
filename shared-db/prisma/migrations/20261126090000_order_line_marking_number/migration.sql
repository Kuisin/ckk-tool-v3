-- 印字番号（A{base}-NNN）の基数を注文明細に持たせる。
--
-- 製品にはレーザーで通し番号を刻む — 1 本ずつ（A200000-001..）か、明細ごとに
-- 1 つ（A200000）。どちらも同じ基数から導けるので、列は基数 1 本だけ。
-- 基数は注文番号・ロット番号とは別の通し連番で、200000 から始まり月次リセット
-- しない。払い出しは確定時（枝番の採番と同じトランザクション）。
--
-- ローリングデプロイ:
--   * 列は nullable で足すだけ。旧アプリは知らないので触らない（確定済みの
--     旧明細は null のまま = 印字番号なし。遡って振らない）。
--   * 採番行は先に置いておく。last_sequence = 199999 なので最初の払い出しが
--     200000 になる。既に行があれば触らない（DO NOTHING）。

ALTER TABLE "app"."order_lines" ADD COLUMN "marking_base" INTEGER;

CREATE UNIQUE INDEX "order_lines_marking_base_key" ON "app"."order_lines"("marking_base");

INSERT INTO "app"."numbering_sequences" ("key", "prefix", "last_year_month", "last_sequence", "updated_at")
VALUES ('MARKING', 'A', NULL, 199999, now())
ON CONFLICT ("key") DO NOTHING;
