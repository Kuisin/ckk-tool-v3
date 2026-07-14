-- 監査ログ（業務操作履歴）。詳細画面の「履歴」タブ・管理者向け操作履歴一覧のデータ源。
-- record_id は業務識別子（文書番号 QOT-…/EST-…、価格表エントリキー、マスタ id）を格納する TEXT。

-- CreateTable
CREATE TABLE "app"."audit_logs" (
    "id" BIGSERIAL NOT NULL,
    "user_id" UUID,
    "action" TEXT NOT NULL,
    "table_name" TEXT NOT NULL,
    "record_id" TEXT,
    "before_data" JSONB,
    "after_data" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "audit_logs_table_name_record_id_idx" ON "app"."audit_logs"("table_name", "record_id");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "app"."audit_logs"("created_at");

-- AddForeignKey
ALTER TABLE "app"."audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
