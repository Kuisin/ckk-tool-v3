-- 注文請書に配送方法とエンドユーザーを持たせる
--   1. order_acceptances.delivery_method — 通常配送 / ユーザー直送
--      （既存の DELIVERY_METHOD enum を再利用。既存行は NORMAL）。
--      出荷書は同じ出荷先×配送方法の注文明細だけを束ねられる（アプリで検証）。
--   2. order_acceptances.end_user_bp_id — エンドユーザー（最終需要家）。
--      ユーザー直送では必須（アプリで強制）。

ALTER TABLE "app"."order_acceptances"
  ADD COLUMN "delivery_method" "app"."DELIVERY_METHOD" NOT NULL DEFAULT 'NORMAL',
  ADD COLUMN "end_user_bp_id" UUID;

ALTER TABLE "app"."order_acceptances"
  ADD CONSTRAINT "order_acceptances_end_user_bp_id_fkey" FOREIGN KEY ("end_user_bp_id")
  REFERENCES "app"."business_partners"("id") ON DELETE SET NULL ON UPDATE CASCADE;
