-- CreateTable
CREATE TABLE "app_price_lists" (
    "id" SERIAL NOT NULL,
    "customer_id" INTEGER NOT NULL,
    "product_id" INTEGER NOT NULL,
    "currency" "Currency" NOT NULL DEFAULT 'JPY',
    "valid_from" TIMESTAMPTZ,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_price_lists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_price_list_tiers" (
    "id" SERIAL NOT NULL,
    "price_list_id" INTEGER NOT NULL,
    "min_quantity" INTEGER NOT NULL,
    "max_quantity" INTEGER,
    "unit_price" DECIMAL(12,2) NOT NULL,
    "currency" "Currency" NOT NULL DEFAULT 'JPY',

    CONSTRAINT "app_price_list_tiers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "app_price_lists_customer_id_idx" ON "app_price_lists"("customer_id");

-- CreateIndex
CREATE INDEX "app_price_lists_product_id_idx" ON "app_price_lists"("product_id");

-- CreateIndex
CREATE INDEX "app_price_lists_is_deleted_idx" ON "app_price_lists"("is_deleted");

-- CreateIndex
CREATE INDEX "app_price_lists_valid_from_idx" ON "app_price_lists"("valid_from");

-- CreateIndex
CREATE UNIQUE INDEX "app_price_lists_customer_id_product_id_key" ON "app_price_lists"("customer_id", "product_id");

-- CreateIndex
CREATE INDEX "app_price_list_tiers_price_list_id_idx" ON "app_price_list_tiers"("price_list_id");

-- AddForeignKey
ALTER TABLE "app_price_lists" ADD CONSTRAINT "app_price_lists_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "app_customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_price_lists" ADD CONSTRAINT "app_price_lists_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "app_products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_price_list_tiers" ADD CONSTRAINT "app_price_list_tiers_price_list_id_fkey" FOREIGN KEY ("price_list_id") REFERENCES "app_price_lists"("id") ON DELETE CASCADE ON UPDATE CASCADE;
