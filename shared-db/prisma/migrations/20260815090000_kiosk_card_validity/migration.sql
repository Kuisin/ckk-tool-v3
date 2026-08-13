-- QRカードの有効期間（テンポラリカード用。null = 無期限）。
-- 期間外のカードはキオスクでログイン不可（判定はログイン時のみ）。
ALTER TABLE "app"."kiosk_cards" ADD COLUMN "valid_from" TIMESTAMPTZ(6);
ALTER TABLE "app"."kiosk_cards" ADD COLUMN "valid_until" TIMESTAMPTZ(6);
