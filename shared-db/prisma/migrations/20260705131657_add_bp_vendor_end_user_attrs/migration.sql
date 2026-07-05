-- CreateEnum
CREATE TYPE "bp"."VENDOR_TYPE" AS ENUM ('SUPPLIER', 'OUTSOURCE');

-- CreateTable
CREATE TABLE "bp"."bp_vendor_attrs" (
    "bp_id" UUID NOT NULL,
    "vendor_code" TEXT,
    "vendor_type" "bp"."VENDOR_TYPE" NOT NULL,
    "closing_day" SMALLINT,
    "payment_terms_days" INTEGER,
    "payment_day" SMALLINT,
    "bank_name" TEXT,
    "bank_branch" TEXT,
    "bank_account_type" TEXT,
    "bank_account_number" TEXT,
    "lead_time_days" INTEGER,
    "notes" TEXT,

    CONSTRAINT "bp_vendor_attrs_pkey" PRIMARY KEY ("bp_id")
);

-- CreateTable
CREATE TABLE "bp"."bp_end_user_attrs" (
    "bp_id" UUID NOT NULL,
    "industry" TEXT,
    "notes" TEXT,

    CONSTRAINT "bp_end_user_attrs_pkey" PRIMARY KEY ("bp_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "bp_vendor_attrs_vendor_code_key" ON "bp"."bp_vendor_attrs"("vendor_code");

-- AddForeignKey
ALTER TABLE "bp"."bp_vendor_attrs" ADD CONSTRAINT "bp_vendor_attrs_bp_id_fkey" FOREIGN KEY ("bp_id") REFERENCES "bp"."business_partners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bp"."bp_end_user_attrs" ADD CONSTRAINT "bp_end_user_attrs_bp_id_fkey" FOREIGN KEY ("bp_id") REFERENCES "bp"."business_partners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

