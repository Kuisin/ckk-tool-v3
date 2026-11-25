-- 自社法人マスタ — 書類の発行元を「コードに書いた 1 社」から「拠点が属する法人」へ。
--
-- これまで見積書・納品書・請求書の PDF は発行元（社名・住所・電話・登録番号）を
-- nextjs-web の各 PDF ルートの定数 ISSUER に直書きしていた。CKK と TSP のように
-- 同じグループの別法人が書類を出すと、どちらの書類にも CKK が刷られる。
--
-- 決め方（利用者の決定）: 自社法人マスタを持ち、**拠点が 1 つの法人に属し、
-- 書類の法人は拠点から決まる**。書類ごとに法人を選ばせない。拠点の分からない
-- 書類は既定の法人（is_default、1 行だけ）。
--
-- ★ このマイグレーションは**既存の書類の見た目を 1 文字も変えない**。担保は 2 点:
--   1. 既定の法人を 1 行、旧 ISSUER 定数と同じ値で入れる（〒・TEL/FAX の組み立ては
--      lib/own-company-core.ts issuerBlock が旧定数と同じ文字列を作る）。
--   2. 全拠点と既存の請求書（スナップショット列 invoices.own_company_id）をその法人に
--      向ける。既存の請求書は実際にその発行元で刷られていたので、事実を埋めるだけ。
--      読み出し側は null も「既定の法人」として刷る（移行中の旧コンテナが作る行）。
--
-- 以下 AlterTable 〜 AddForeignKey は prisma migrate diff の生成そのまま。
-- 部分 unique index と初期データは末尾に手で足してある。

-- AlterTable
ALTER TABLE "app"."invoices" ADD COLUMN     "own_company_id" INTEGER;

-- AlterTable
ALTER TABLE "app"."plants" ADD COLUMN     "own_company_id" INTEGER;

-- CreateTable
CREATE TABLE "app"."own_companies" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" JSONB NOT NULL,
    "name_kana" TEXT,
    "postal_code" TEXT,
    "address" JSONB,
    "phone" TEXT,
    "fax" TEXT,
    "email" TEXT,
    "invoice_registration_no" TEXT,
    "seal_file_id" UUID,
    "bank_name" TEXT,
    "bank_branch" TEXT,
    "bank_account_type" TEXT,
    "bank_account_number" TEXT,
    "bank_account_holder" TEXT,
    "fiscal_year_start_month" SMALLINT NOT NULL DEFAULT 4,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "own_companies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "own_companies_code_key" ON "app"."own_companies"("code");

-- CreateIndex
CREATE INDEX "invoices_own_company_id_idx" ON "app"."invoices"("own_company_id");

-- CreateIndex
CREATE INDEX "plants_own_company_id_idx" ON "app"."plants"("own_company_id");

-- AddForeignKey
ALTER TABLE "app"."invoices" ADD CONSTRAINT "invoices_own_company_id_fkey" FOREIGN KEY ("own_company_id") REFERENCES "app"."own_companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."own_companies" ADD CONSTRAINT "own_companies_seal_file_id_fkey" FOREIGN KEY ("seal_file_id") REFERENCES "app"."files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."plants" ADD CONSTRAINT "plants_own_company_id_fkey" FOREIGN KEY ("own_company_id") REFERENCES "app"."own_companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── 以下は手で足した分（Prisma スキーマからは生成されない）────────────────────

-- 既定の法人は 1 つだけ。部分 unique index は Prisma が表現できないので直接書く
-- （tax_categories_is_default_idx と同じ流儀）。
CREATE UNIQUE INDEX "own_companies_is_default_idx"
  ON "app"."own_companies"("is_default") WHERE "is_default";

-- 会計年度の開始月は 1〜12（法人ごとの採番の年度区切り）。
ALTER TABLE "app"."own_companies"
  ADD CONSTRAINT "own_companies_fiscal_year_start_month_check"
  CHECK ("fiscal_year_start_month" BETWEEN 1 AND 12);

-- コードは作成後に変えられない。書類番号に法人コードが埋め込まれる
-- （例: CKK/QOT-2026-00001）ので、変えると発行済みの番号と食い違う。
-- 画面も編集時は読み取り専用だが、psql やスクリプトからの変更も DB で止める。
CREATE OR REPLACE FUNCTION "app"."own_companies_code_immutable"()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."code" IS DISTINCT FROM OLD."code" THEN
    RAISE EXCEPTION 'own_companies.code is immutable (% -> %)', OLD."code", NEW."code"
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "own_companies_code_immutable"
  BEFORE UPDATE OF "code" ON "app"."own_companies"
  FOR EACH ROW EXECUTE FUNCTION "app"."own_companies_code_immutable"();

-- 初期データ — 旧 ISSUER 定数（api/pdf/{quote,delivery-note,invoice}/route.ts）の値。
-- 登録番号も旧定数の値をそのまま移している（実番号への差し替えは画面 MS0I から）。
INSERT INTO "app"."own_companies"
  ("code", "name", "postal_code", "address", "phone", "fax",
   "invoice_registration_no", "is_default", "updated_at")
VALUES
  ('CKK', '{"ja":"シー・ケィ・ケー株式会社"}'::jsonb, '475-0823',
   '{"ja":"愛知県半田市港町2丁目27番2"}'::jsonb, '0569-21-6187', '0569-23-6427',
   'T1234567890123', true, CURRENT_TIMESTAMP);

-- 全拠点・既存の請求書を既定の法人へ（担保 2）。TSP の拠点は画面で付け替える。
UPDATE "app"."plants"
   SET "own_company_id" = (SELECT "id" FROM "app"."own_companies" WHERE "code" = 'CKK');
UPDATE "app"."invoices"
   SET "own_company_id" = (SELECT "id" FROM "app"."own_companies" WHERE "code" = 'CKK');
