-- 料金マスタ（送料などの追加項目）と、指示書・出荷書に付ける追加料金の行。
--
-- 製品の代金以外に請求するもの（送料・梱包費・特急料金・型費）を表す場所が
-- これまで無く、備考に書いて人が請求書へ足すか、単価に混ぜて誤魔化すしか
-- なかった — どちらも後から「何にいくら掛かったのか」を読めない。
--
-- **金額の決まり方が 2 通りある**ので charge_items.amount_mode で分ける:
--   FIXED    = マスタの金額をそのまま使う（担当者ごとにぶれてはいけないもの）
--   VARIABLE = 使うたびに人が入れる（送料のように実費が都度違うもの）
--
-- 行が 2 つの表に分かれているのは、意味が違うから（作業計画と実績と同じ）:
--   work_order_charges     … **予定**。生産側が「このロットは送料が要る」と先に書く
--   delivery_order_charges … **確定**。請求されるのはこちら
-- 出荷書を作るとき、載せたロットの指示書から複写する。複写後は出荷書側だけを
-- 直す — 実費・箱数・同梱で要らなくなった、は出荷のときにしか決まらない。
--
-- 金額は行に焼き込む（unit_price / amount）。マスタを後から直しても、すでに
-- 書いた行は動かない（見積・受注の単価と同じ考え方）。
--
-- **既存データは 1 行も動かない**（新規テーブルのみ）。表が空の間は請求書の
-- 中身も従来どおりで、行を入れた出荷からだけ明細が増える。
--
-- 以下は prisma migrate diff の生成そのまま。

-- CreateEnum
CREATE TYPE "app"."CHARGE_AMOUNT_MODE" AS ENUM ('FIXED', 'VARIABLE');

-- CreateTable
CREATE TABLE "app"."charge_items" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" JSONB NOT NULL,
    "amount_mode" "app"."CHARGE_AMOUNT_MODE" NOT NULL,
    "default_amount" DECIMAL(12,2),
    "tax_category_id" INTEGER,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "charge_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."work_order_charges" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "work_order_id" UUID NOT NULL,
    "charge_item_id" INTEGER NOT NULL,
    "description" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unit_price" DECIMAL(12,2) NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "notes" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "work_order_charges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."delivery_order_charges" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "delivery_order_year_month" CHAR(6) NOT NULL,
    "delivery_order_seq" INTEGER NOT NULL,
    "charge_item_id" INTEGER NOT NULL,
    "source_work_order_id" UUID,
    "description" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unit_price" DECIMAL(12,2) NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "notes" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "delivery_order_charges_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "charge_items_code_key" ON "app"."charge_items"("code");

-- CreateIndex
CREATE INDEX "charge_items_is_active_sort_order_idx" ON "app"."charge_items"("is_active", "sort_order");

-- CreateIndex
CREATE INDEX "charge_items_tax_category_id_idx" ON "app"."charge_items"("tax_category_id");

-- CreateIndex
CREATE INDEX "charge_items_updated_at_id_idx" ON "app"."charge_items"("updated_at", "id");

-- CreateIndex
CREATE INDEX "work_order_charges_work_order_id_sort_order_idx" ON "app"."work_order_charges"("work_order_id", "sort_order");

-- CreateIndex
CREATE INDEX "work_order_charges_charge_item_id_idx" ON "app"."work_order_charges"("charge_item_id");

-- CreateIndex
CREATE INDEX "delivery_order_charges_delivery_order_year_month_delivery_o_idx" ON "app"."delivery_order_charges"("delivery_order_year_month", "delivery_order_seq", "sort_order");

-- CreateIndex
CREATE INDEX "delivery_order_charges_charge_item_id_idx" ON "app"."delivery_order_charges"("charge_item_id");

-- AddForeignKey
ALTER TABLE "app"."charge_items" ADD CONSTRAINT "charge_items_tax_category_id_fkey" FOREIGN KEY ("tax_category_id") REFERENCES "app"."tax_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."work_order_charges" ADD CONSTRAINT "work_order_charges_work_order_id_fkey" FOREIGN KEY ("work_order_id") REFERENCES "app"."work_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."work_order_charges" ADD CONSTRAINT "work_order_charges_charge_item_id_fkey" FOREIGN KEY ("charge_item_id") REFERENCES "app"."charge_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."work_order_charges" ADD CONSTRAINT "work_order_charges_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "app"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."delivery_order_charges" ADD CONSTRAINT "delivery_order_charges_delivery_order_year_month_delivery__fkey" FOREIGN KEY ("delivery_order_year_month", "delivery_order_seq") REFERENCES "app"."delivery_orders"("year_month", "seq") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."delivery_order_charges" ADD CONSTRAINT "delivery_order_charges_charge_item_id_fkey" FOREIGN KEY ("charge_item_id") REFERENCES "app"."charge_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."delivery_order_charges" ADD CONSTRAINT "delivery_order_charges_source_work_order_id_fkey" FOREIGN KEY ("source_work_order_id") REFERENCES "app"."work_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."delivery_order_charges" ADD CONSTRAINT "delivery_order_charges_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "app"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

