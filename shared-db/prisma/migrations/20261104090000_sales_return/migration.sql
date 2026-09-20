-- 出荷後の返品（在庫の記録漏れ 4 件のうちの最後）。
--
-- 出した物が返ってくる経路が 1 本も無かった。出荷は一方通行で
-- （onDeliveryOrderShippedTx に逆向きが無い）、返品を受け取っても在庫は
-- 減ったままだった。数を合わせるには棚卸で「増えた理由の分からない差異」
-- として足すしかなく、それは返品の記録ではない。
--
-- 形は**逆仕訳の伝票 1 枚**（事由 SALES_RETURN、元書類 = その出荷書）。
-- 出荷書の状態は動かさない — 出荷した事実は消えないため。
--
-- 何本戻ったかは**出荷明細の行に持つ**。伝票から数え直す案もあったが、
-- 伝票行が指すのは在庫バケット（品目 × ロット）なので、同じ品目・同じ
-- ロットの明細が 2 行ある出荷書では取り違える。
--
-- 請求は**動かさない**（返品が請求書に跳ねるかは締めの運用で決まる話で、
-- 在庫の記録とは別の判断）。注文明細の状態も動かさない。

ALTER TYPE "app"."INVENTORY_MOVEMENT_CAUSE" ADD VALUE IF NOT EXISTS 'SALES_RETURN';

-- 既定 0 で足すので、旧アプリ（この列を知らない）はそのまま動く。
ALTER TABLE "app"."delivery_order_items"
  ADD COLUMN "returned_quantity" INTEGER NOT NULL DEFAULT 0;

-- 戻り過ぎを DB でも止める（画面とサーバーの両方で見るが、最後の砦は表）。
ALTER TABLE "app"."delivery_order_items"
  ADD CONSTRAINT "delivery_order_items_returned_within_shipped"
  CHECK ("returned_quantity" >= 0 AND "returned_quantity" <= "quantity");
