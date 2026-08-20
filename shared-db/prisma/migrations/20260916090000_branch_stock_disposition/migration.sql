-- 分岐系列の終端処理（§7）。
--
-- 分岐（work_order_step_links の分岐エッジ）で流した数量は、これまで
-- 「本流へ合流する」か「どこにも行かない」かのどちらかだった。後者は
-- 指示書が完了しても行き場が無く、良品数が在庫にも本流にも乗らない。
--
-- これからは分岐は必ず **合流** か **在庫** で終わる。在庫で終わる場合、
-- 系列の終端工程にこの列を立て、その工程の良品数を指定の在庫へ入れる
-- （半製品 = 再投入待ちの中間品 / 製品 = ロット付きの完成品）。
-- null = 合流する（終端から本流へリンクがある）か、分岐系列ではない工程。
--
-- 既存行は全て null。合流先の無い分岐が残っているデータは、画面側で
-- 「終端が未設定」として直せるようにする（ここでは推測して埋めない —
-- 半製品か製品かは業務判断なので）。

CREATE TYPE "app"."BRANCH_STOCK_DISPOSITION" AS ENUM ('SEMI_FINISHED', 'PRODUCT');

ALTER TABLE "app"."work_order_steps"
  ADD COLUMN "branch_stock_disposition" "app"."BRANCH_STOCK_DISPOSITION";
