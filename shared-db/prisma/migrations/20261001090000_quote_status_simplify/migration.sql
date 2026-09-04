-- allow-rewrite: このマイグレーションは **どの DB にも適用されていない**。
--   2026-09-04 時点で dev・main とも `_prisma_migrations` にこの 1 行が失敗で
--   残っている（enum は 5 値のまま = トランザクションごと巻き戻っていて、
--   部分適用は無い）。落ちる原因は 2 つあり、順番に踏んだ:
--
--   (1) 既定値 'DRAFT'::app."QUOTE_STATUS" を外さずに型を差し替えていた。列を
--       text にしても既定値の式は ('DRAFT'::app."QUOTE_STATUS")::text として
--       古い型を参照したまま残るので、DROP TYPE が落ちる:
--         ERROR: cannot drop type app."QUOTE_STATUS" because other objects depend on it
--   (2) (1) を直したら次はビューで落ちた。analytics.v_quotes が status を
--       そのまま出しているため、列の型を変えられない:
--         ERROR: cannot alter type of a column used by a view or rule
--       ★ (2) は **使い捨て DB のテストでは再現しない**。analytics-views.sql は
--       マイグレーションではなく毎デプロイ流し直す 3 本の 1 つなので、
--       migrate deploy だけで建てた DB にビューが存在しないため。実際に
--       それで一度取り逃がし、dev のデプロイをもう一度落とした。同じ列を
--       触るときは「ビューがある状態」を作って試すこと。
--
--   **後ろに足すマイグレーションでは直せない。** Prisma は失敗した 1 本が
--   あるとその先を一切流さない（P3018）ので、新しいファイルを足しても永遠に
--   届かない。まっさらな DB でも同じ場所で必ず止まるため、「新規 DB は
--   migrate deploy だけで建つ」という前提も破れている。直す道はこのファイルを
--   直すことだけ。
--
--   マージ後に **dev と main の両方で** 1 回だけ次を実行して、失敗行を
--   巻き戻し済みに直すこと（そこで初めて deploy がこの修正版を流す）:
--     pnpm exec prisma migrate resolve \
--       --rolled-back "20261001090000_quote_status_simplify"
--
-- allow-destructive: QUOTE_STATUS から ACCEPTED / REJECTED / EXPIRED を落とす。
--   ACCEPTED は注文請書の確定が自動でセットしていただけの表示上のマーカーで、
--   受諾したかどうかは下流の注文請書の有無で読めるため廃止。REJECTED は
--   状態 Select から手で選べていただけで、対応する業務操作が無かった。
--   EXPIRED は今後 valid_until から都度その場で導く派生状態にする（保存しない
--   — 締切を過ぎた瞬間に正しくなる。cron 不要）。この PR で見積書の状態遷移を
--   縮め、発行後は編集できず複製で作り直す方式へ変えた（あわせて
--   order-acceptances の確定処理から ISSUED→ACCEPTED の自動遷移も削除した）。
--
--   確認済み: dev/main とも ACCEPTED/REJECTED/EXPIRED の行は 0 件
--   （2026-10-01 時点。app.quotes は dev に ISSUED が 3 件のみ、main は 0 件）。
--   下の UPDATE は将来の巻き戻し・手動データ投入に備えた防御であって、
--   実データの移行が要るわけではない。

-- 依存しているビューを先に落とす。Postgres は「ビューから参照されている列」の
-- 型を変えさせない（0A000: cannot alter type of a column used by a view or rule）。
-- analytics.v_quotes は q.status をそのまま出しているので、CREATE OR REPLACE で
-- 作り直すこともできない（ビュー列の型は置き換えられない）。落とすしかない。
--
-- 落としっぱなしにはならない: db-migrate の entrypoint は毎回
-- `migrate deploy` のあとに grants.sql → kiosk-cron.sql → analytics-views.sql を
-- 流すので、同じデプロイの中で作り直される。
--
-- **使い捨て DB のテストでは絶対に再現しない。** analytics-views.sql は
-- マイグレーションではない（スキーマの成長に合わせて毎回流し直す 3 本の 1 つ）
-- ため、migrate deploy だけで建てた DB にビューは存在せず、この行が無くても
-- 通ってしまう。実際それで一度取り逃がしている。
DROP VIEW IF EXISTS "analytics"."v_quotes";

-- 既定値を先に外す。外さないと DROP TYPE が「既定値がこの型に依存している」で
-- 落ちる（列を text にしても既定値の式は古い型を参照したまま残るため）。
-- 新しい型の既定値は最後の ALTER で入れ直している。
ALTER TABLE "app"."quotes" ALTER COLUMN "status" DROP DEFAULT;

ALTER TABLE "app"."quotes" ALTER COLUMN "status" TYPE text;

UPDATE "app"."quotes" SET "status" = 'ISSUED' WHERE "status" IN ('ACCEPTED', 'REJECTED', 'EXPIRED');

DROP TYPE "app"."QUOTE_STATUS";

CREATE TYPE "app"."QUOTE_STATUS" AS ENUM ('DRAFT', 'ISSUED');

ALTER TABLE "app"."quotes"
  ALTER COLUMN "status" TYPE "app"."QUOTE_STATUS" USING "status"::"app"."QUOTE_STATUS",
  ALTER COLUMN "status" SET DEFAULT 'DRAFT'::"app"."QUOTE_STATUS";
