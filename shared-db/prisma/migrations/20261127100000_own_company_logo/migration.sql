-- 自社法人のロゴ画像（MS0I）。PDF（見積書・納品書・請求書・設計依頼書・検査表・
-- ポータル案内）の見出しに、書類の法人のロゴを刷る。null = ロゴなし — 既定の法人
-- だけは同梱の logo.svg へ落ち、他の法人の書類には何も刷らない（CKK のマークを
-- TSP の書類に刷らないため。社印 seal_file_id と同じ考え方）。
--
-- 列を足すだけ — 既存の行はすべて null（= 今日と同じ見た目）。
ALTER TABLE "app"."own_companies" ADD COLUMN "logo_file_id" UUID;

ALTER TABLE "app"."own_companies" ADD CONSTRAINT "own_companies_logo_file_id_fkey" FOREIGN KEY ("logo_file_id") REFERENCES "app"."files"("id") ON DELETE SET NULL ON UPDATE CASCADE;
