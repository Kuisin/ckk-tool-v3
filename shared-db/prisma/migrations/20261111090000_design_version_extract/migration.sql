-- 設計図の版に「図面から読み取った値」を持たせる（design_versions.extract）。
--
-- 図脳 SXF を読んだ欄は画面で読み取り専用になり、人が「手入力」に切り替えた
-- 欄だけ上書きできる。上書きしても読み取った値は参照として残す — そのための列。
-- 形は { source: {fileName, sheetNumber, software, readAt}, values: {欄: 値},
-- overridden: [欄] }（lib/design-extract-core.ts が唯一の定義元）。
--
-- 列の追加だけ（nullable・既定なし）。旧アプリはこの列を読まないので影響しない。

ALTER TABLE "app"."design_versions" ADD COLUMN "extract" JSONB;
