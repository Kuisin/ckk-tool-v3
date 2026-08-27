-- allow-destructive: enum 値の改名。DESIGN_FILE_ROLE を使うのは設計依頼 (SA06)
--   だけで、まだ本番未公開（feature-flags-seed に app:design-requests:main 無し）。
--   dev のデータも数件。旧アプリが 'PRIMARY' を期待して落ちうるが、対象が
--   閉じているので expand/contract に分けるより素直に改名する。
--
-- 設計依頼書 (SA06): 設計ファイルの役割を 3 つに分ける。
--
-- これまでは 主図面(PRIMARY) + 参考資料(REFERENCE) の 2 つで、STL のような
-- 「見るためのファイル」と CAD のような「加工プログラムを起こす元データ」が
-- 同じ主図面の枠を取り合っていた。用途が違い片方で代用できないので、
--   PREVIEW   … 人が形を確かめる（3D 表示）
--   BLUEPRINT … 成果物の本体（製品マスタの最新図面もこれ）
--   REFERENCE … その他
-- に分ける。
--
-- RENAME VALUE は既存行を書き換えずに済む（PRIMARY の行はそのまま BLUEPRINT に
-- なる）。ADD VALUE はこの中で**使っていない**ので同一ファイルで足りる
-- （使う場合は 20260910090000 / 090100 と同じく分けること）。

ALTER TYPE "app"."DESIGN_FILE_ROLE" RENAME VALUE 'PRIMARY' TO 'BLUEPRINT';
ALTER TYPE "app"."DESIGN_FILE_ROLE" ADD VALUE IF NOT EXISTS 'PREVIEW' BEFORE 'BLUEPRINT';

ALTER TABLE "app"."design_files"
  ALTER COLUMN "role" SET DEFAULT 'BLUEPRINT'::"app"."DESIGN_FILE_ROLE";
