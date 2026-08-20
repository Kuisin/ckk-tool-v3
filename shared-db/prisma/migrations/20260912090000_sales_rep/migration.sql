-- 営業担当（CKK 側の担当者）
--
-- 1. app.bp_sales_reps — 顧客ごとの営業担当候補（複数可）。書類の営業担当は
--    この一覧から選ぶ。is_primary の 1 名が新規書類の既定値。
-- 2. 顧客を持つ書類に sales_rep_id を追加。作成時に主担当を複写する
--    スナップショットなので、顧客側の担当が替わっても過去書類は動かない。
--    注文明細（order_lines）は行に複写せず注文請書ヘッダから読む。

-- ── 1. 顧客の営業担当候補 ────────────────────────────────────────────
CREATE TABLE "app"."bp_sales_reps" (
    "bp_id"      UUID    NOT NULL,
    "user_id"    UUID    NOT NULL,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bp_sales_reps_pkey" PRIMARY KEY ("bp_id", "user_id")
);

CREATE INDEX "bp_sales_reps_user_id_idx" ON "app"."bp_sales_reps"("user_id");

-- 主担当は顧客あたり 1 名まで（部分 unique index — Prisma スキーマには
-- 現れないので、アプリ側の書き込みもこの前提で組むこと）。
CREATE UNIQUE INDEX "bp_sales_reps_primary_uniq"
    ON "app"."bp_sales_reps"("bp_id") WHERE "is_primary";

ALTER TABLE "app"."bp_sales_reps"
    ADD CONSTRAINT "bp_sales_reps_bp_id_fkey"
    FOREIGN KEY ("bp_id") REFERENCES "app"."business_partners"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "app"."bp_sales_reps"
    ADD CONSTRAINT "bp_sales_reps_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "app"."users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── 2. 書類の営業担当スナップショット ────────────────────────────────
ALTER TABLE "app"."estimates"           ADD COLUMN "sales_rep_id" UUID;
ALTER TABLE "app"."price_list_entries"  ADD COLUMN "sales_rep_id" UUID;
ALTER TABLE "app"."quotes"              ADD COLUMN "sales_rep_id" UUID;
ALTER TABLE "app"."order_acceptances"   ADD COLUMN "sales_rep_id" UUID;
ALTER TABLE "app"."shipping_orders"     ADD COLUMN "sales_rep_id" UUID;
ALTER TABLE "app"."delivery_notes"      ADD COLUMN "sales_rep_id" UUID;
ALTER TABLE "app"."invoices"            ADD COLUMN "sales_rep_id" UUID;

ALTER TABLE "app"."estimates"
    ADD CONSTRAINT "estimates_sales_rep_id_fkey"
    FOREIGN KEY ("sales_rep_id") REFERENCES "app"."users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "app"."price_list_entries"
    ADD CONSTRAINT "price_list_entries_sales_rep_id_fkey"
    FOREIGN KEY ("sales_rep_id") REFERENCES "app"."users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "app"."quotes"
    ADD CONSTRAINT "quotes_sales_rep_id_fkey"
    FOREIGN KEY ("sales_rep_id") REFERENCES "app"."users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "app"."order_acceptances"
    ADD CONSTRAINT "order_acceptances_sales_rep_id_fkey"
    FOREIGN KEY ("sales_rep_id") REFERENCES "app"."users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "app"."shipping_orders"
    ADD CONSTRAINT "shipping_orders_sales_rep_id_fkey"
    FOREIGN KEY ("sales_rep_id") REFERENCES "app"."users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "app"."delivery_notes"
    ADD CONSTRAINT "delivery_notes_sales_rep_id_fkey"
    FOREIGN KEY ("sales_rep_id") REFERENCES "app"."users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "app"."invoices"
    ADD CONSTRAINT "invoices_sales_rep_id_fkey"
    FOREIGN KEY ("sales_rep_id") REFERENCES "app"."users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
