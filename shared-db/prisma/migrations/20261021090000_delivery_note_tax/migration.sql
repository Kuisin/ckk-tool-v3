-- 納品書の明細にも税のスナップショットを持たせる。
--
-- 請求書・見積書と同じ扱いにする（20261020090000_tax_categories の続き）。納品書も
-- 取引先へ渡す印刷物なので、発行後に税区分マスタを直しても中身が動いてはいけない。
--
-- 焼き込むのは**出荷書の確定時**で、請求単価 (delivery_order_items.unit_price) と
-- 同じ 1 トランザクション。納品書はそこで ISSUED として作られる（下書きを経由しない）。
--
-- **税額は行に持たない** — 税は率ごとの束でしか正しく丸められない（lib/money.ts の
-- 方針。行ごとに丸めると単一税率でも 1 円ずれる）。
--
-- 価格記載なし (include_price = false) の納品書は単価も金額も持たないので、税も null。
-- 既存の行も null で、読み出し側は「率が無ければ顧客の課税区分から起こす」— だから
-- 発行済みの納品書の見た目は変わらない。

-- AlterTable
ALTER TABLE "app"."delivery_note_items" ADD COLUMN     "tax_category_id" INTEGER,
ADD COLUMN     "tax_rate" DECIMAL(5,4);

-- CreateIndex
CREATE INDEX "delivery_note_items_tax_category_id_idx" ON "app"."delivery_note_items"("tax_category_id");

-- AddForeignKey
ALTER TABLE "app"."delivery_note_items" ADD CONSTRAINT "delivery_note_items_tax_category_id_fkey" FOREIGN KEY ("tax_category_id") REFERENCES "app"."tax_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
