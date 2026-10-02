-- 顧客専用の製品コード（製品 × 顧客の別名）。
--
-- 相手は自分の品番で注文を出し、自分の品番で納品書・請求書を照合する。こちらの
-- 製品コード（PRD-YYYYMM-NNNN）も製品名も相手の書類には出てこないので、注文書の
-- 突合は品名の表記ゆれ（products.match_names）に頼るしかなかった。品名は揺れるが
-- **品番は揺れない** — ここが埋まっている顧客の注文書は 1 発で決まる。
--
-- products.match_names との違いは「誰の言葉か」:
--   match_names            = 誰が書いてもこう読めるはず、という全社共通の別名
--   customer_product_codes = この顧客だけがこう呼ぶ、という対応
-- 同じ品番を別の顧客が別の製品に使っていても衝突しない（unique は顧客ごと）。
--
-- 制約の意図:
--   (customer_bp_id, product_id) unique — 印字に使う表記が 2 つあってはいけない
--   (customer_bp_id, code)       unique — でないと突合が 2 製品に当たり、自動確定できない
--   aliases は突合専用の追加表記（旧品番など）。印字しない — 相手に出す書類に
--   昔の品番を刷ると、どちらが現行か読めなくなる。
--
-- **既存データは 1 行も動かない**（新規テーブルのみ）。表が空の間は突合も印字も
-- 従来どおりで、行を入れた顧客からだけ挙動が変わる。
--
-- 以下は prisma migrate diff の生成そのまま。

-- CreateTable
CREATE TABLE "app"."customer_product_codes" (
    "id" SERIAL NOT NULL,
    "customer_bp_id" UUID NOT NULL,
    "product_id" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT,
    "aliases" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "customer_product_codes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "customer_product_codes_product_id_idx" ON "app"."customer_product_codes"("product_id");

-- CreateIndex
CREATE INDEX "customer_product_codes_code_idx" ON "app"."customer_product_codes"("code");

-- CreateIndex
CREATE INDEX "customer_product_codes_aliases_idx" ON "app"."customer_product_codes" USING GIN ("aliases" array_ops);

-- CreateIndex
CREATE INDEX "customer_product_codes_updated_at_id_idx" ON "app"."customer_product_codes"("updated_at", "id");

-- CreateIndex
CREATE UNIQUE INDEX "customer_product_codes_customer_bp_id_product_id_key" ON "app"."customer_product_codes"("customer_bp_id", "product_id");

-- CreateIndex
CREATE UNIQUE INDEX "customer_product_codes_customer_bp_id_code_key" ON "app"."customer_product_codes"("customer_bp_id", "code");

-- AddForeignKey
ALTER TABLE "app"."customer_product_codes" ADD CONSTRAINT "customer_product_codes_customer_bp_id_fkey" FOREIGN KEY ("customer_bp_id") REFERENCES "app"."business_partners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."customer_product_codes" ADD CONSTRAINT "customer_product_codes_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "app"."products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."customer_product_codes" ADD CONSTRAINT "customer_product_codes_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "app"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

