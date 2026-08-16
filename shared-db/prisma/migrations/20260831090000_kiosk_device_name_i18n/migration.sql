-- 端末名を多言語 JSON { ja, en } にする（_specs/design.md §17.4）。
-- 既存の文字列は ja / en の両方に入れて移行する（英語名は後から編集可能）。
-- USING で in-place 変換するのでデータは失われない。

ALTER TABLE "app"."kiosk_devices"
  ALTER COLUMN "name" TYPE JSONB
  USING CASE
    WHEN "name" IS NULL THEN NULL
    ELSE jsonb_build_object('ja', "name", 'en', "name")
  END;
