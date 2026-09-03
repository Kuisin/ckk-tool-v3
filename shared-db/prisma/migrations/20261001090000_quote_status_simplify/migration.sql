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

ALTER TABLE "app"."quotes" ALTER COLUMN "status" TYPE text;

UPDATE "app"."quotes" SET "status" = 'ISSUED' WHERE "status" IN ('ACCEPTED', 'REJECTED', 'EXPIRED');

DROP TYPE "app"."QUOTE_STATUS";

CREATE TYPE "app"."QUOTE_STATUS" AS ENUM ('DRAFT', 'ISSUED');

ALTER TABLE "app"."quotes"
  ALTER COLUMN "status" TYPE "app"."QUOTE_STATUS" USING "status"::"app"."QUOTE_STATUS",
  ALTER COLUMN "status" SET DEFAULT 'DRAFT'::"app"."QUOTE_STATUS";
