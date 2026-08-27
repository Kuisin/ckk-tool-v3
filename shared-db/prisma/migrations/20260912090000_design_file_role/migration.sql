-- 設計依頼書 (SA06): 1 つの版を「主図面 1 枚 + 参考資料 0..N 枚」で持てるようにする。
--
-- これまで 1 回の完了 = 1 ファイル = 1 版で、組図・部品図・3D モデルを同時に
-- 出すと版番号が別々に進み、「v3 にしてください」が何を指すか人によって
-- 変わってしまった。version は**図面の改訂世代**なので、同時に出したファイルは
-- 同じ version を共有し、role だけで区別する。
--
-- CREATE TYPE で作った新しい型は同一トランザクション内で使ってよい
-- （使えないのは既存 enum への ALTER TYPE ADD VALUE。前例 20260910090000）。
--
-- 既存行はすべて「その版の唯一のファイル」なので PRIMARY で正しい。

CREATE TYPE "app"."DESIGN_FILE_ROLE" AS ENUM ('PRIMARY', 'REFERENCE');

ALTER TABLE "app"."design_files"
  ADD COLUMN "role" "app"."DESIGN_FILE_ROLE" NOT NULL DEFAULT 'PRIMARY';

-- 製品の最新図面（is_latest かつ PRIMARY）を引くための索引。
CREATE INDEX "design_files_product_id_is_latest_role_idx"
  ON "app"."design_files"("product_id", "is_latest", "role");
