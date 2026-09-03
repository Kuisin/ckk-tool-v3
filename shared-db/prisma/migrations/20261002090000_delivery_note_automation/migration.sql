-- 納品書の自動発行（出荷書 確定時）に向けた注文請書側の目印。
--
-- 顧客が自前の納品書（バーコード印字など）を用意している取引では、自社発行の
-- 納品書にそれを同梱する運用がある。自動作成される納品書の通数・宛先は
-- 変えず、出荷準備担当への注意喚起としてだけ使う（下書き中のみ編集可）。

-- AlterTable
ALTER TABLE "app"."order_acceptances" ADD COLUMN     "customer_provides_delivery_note" BOOLEAN NOT NULL DEFAULT false;
