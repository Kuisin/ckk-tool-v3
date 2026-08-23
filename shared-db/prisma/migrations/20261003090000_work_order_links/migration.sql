-- 指示書→指示書の数量受け渡しリンク（例: リブ母材 WO → 製品 WO）。
-- source 完了まで target の先頭メインライン工程は開始不可（canStartStep）。
-- quantity null = source 完了時の完成数全量。
-- 自己リンクは CHECK、閉路はアプリ側 tx（work-order-links-core.ts）で防ぐ。

-- CreateTable
CREATE TABLE "app"."work_order_links" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "source_work_order_id" UUID NOT NULL,
    "target_work_order_id" UUID NOT NULL,
    "quantity" INTEGER,
    "notes" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "work_order_links_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "work_order_links_target_work_order_id_idx" ON "app"."work_order_links"("target_work_order_id");

-- CreateIndex
CREATE UNIQUE INDEX "work_order_links_source_work_order_id_target_work_order_id_key" ON "app"."work_order_links"("source_work_order_id", "target_work_order_id");

-- AddForeignKey
ALTER TABLE "app"."work_order_links" ADD CONSTRAINT "work_order_links_source_work_order_id_fkey" FOREIGN KEY ("source_work_order_id") REFERENCES "app"."work_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."work_order_links" ADD CONSTRAINT "work_order_links_target_work_order_id_fkey" FOREIGN KEY ("target_work_order_id") REFERENCES "app"."work_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."work_order_links" ADD CONSTRAINT "work_order_links_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "app"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 自己リンク禁止（アプリ検証のバックストップ）
ALTER TABLE "app"."work_order_links" ADD CONSTRAINT "work_order_links_no_self" CHECK ("source_work_order_id" <> "target_work_order_id");
