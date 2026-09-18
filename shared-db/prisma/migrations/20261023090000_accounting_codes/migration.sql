-- 会計連携 — 仕訳 CSV を会計ソフトの「科目コード」で出せるようにする（§9 会計・請求）。
--
-- これまでの形: lib/csv-export.ts が勘定科目を**日本語の科目名**（売掛金 / 売上高 /
-- 仮受消費税）で直書きし、列は 6 列固定だった。移行先の会計ソフト（TKC FX4クラウド）は
-- 科目名ではなく**科目コード**で仕訳を受けるため、直書きでは 1 行も取り込めない。
--
-- コードは経理（税務事務所）が決めるもので**環境ごとに違う**。マイグレーションは
-- どの環境にも同じように当たるので、ここでは**列を空で足すだけ**にして実値は入れない
-- （素材・拠点などと同じ extended-master-seed の規約）。空 = system_settings の
-- accounting.* の既定に従う、というはしごをアプリ側 (accounting-export-core.ts) が持つ。
--
-- ★ このマイグレーションは**既存データを 1 件も落とさない**。担保は 2 点:
--   1. invoices.yayoi_exported_at は **RENAME**（DROP + ADD ではない）。prisma migrate dev
--      の生成そのままだと DROP + ADD になり、**既に会計へ渡した印が全部消える** —
--      印が消えると二重取込の防止が効かなくなるので、ここだけ手で書き換えてある。
--   2. 新しい列は全て NULL 許容で既定値も無い。読み出し側は NULL を「設定の既定に従う」
--      として扱うので、設定を入れるまでの出力は列が増える前と同じ。
--
-- 列名に会計ソフトの製品名を入れない（i18n-glossary §4 決定 19）。弥生のときは
-- yayoi_exported_at という名前にしたせいで、ソフトを替えるだけでこのマイグレーションが
-- 必要になった。同じことを繰り返さないため accounting_exported_at にする。

-- AlterTable — 売掛金の科目・補助科目（借方）。補助科目は得意先。
ALTER TABLE "app"."bp_customer_attrs" ADD COLUMN     "receivable_account_code" TEXT,
ADD COLUMN     "receivable_sub_account_code" TEXT;

-- AlterTable — 消費税コードと貸方の科目（売上行 / 消費税行）。
ALTER TABLE "app"."tax_categories" ADD COLUMN     "sales_account_code" TEXT,
ADD COLUMN     "tax_account_code" TEXT,
ADD COLUMN     "tax_code" TEXT;

-- RenameColumn — ★ 手で書き換えた箇所（生成物は DROP + ADD だった）。
ALTER TABLE "app"."invoices" RENAME COLUMN "yayoi_exported_at" TO "accounting_exported_at";

-- ── 以下は手で足した分 ────────────────────────────────────────────────────
-- 会計連携の既定（マスタ側の科目コードが空のときのフォールバック）。値は空文字で、
-- 実値は SY0J 会計連携の画面から入れる。キーだけ先に作っておくのは、設定画面が
-- 初回表示のときに「まだ 1 度も保存していない」状態を特別扱いしないで済むように。
-- updated_at は NOT NULL で DB 側の既定を持たない（Prisma の @updatedAt はアプリ側で
-- しか効かない）ので、ここで now() を明示する。
INSERT INTO "app"."system_settings" ("key", "value", "description", "updated_at")
VALUES ('accounting.receivableAccountCode', '""'::jsonb, '会計連携: 既定の売掛金 科目コード（借方）', now()),
       ('accounting.salesAccountCode',      '""'::jsonb, '会計連携: 既定の売上高 科目コード（貸方・売上行）', now()),
       ('accounting.taxAccountCode',        '""'::jsonb, '会計連携: 既定の仮受消費税 科目コード（貸方・消費税行）', now()),
       ('accounting.taxCode',               '""'::jsonb, '会計連携: 既定の消費税コード', now())
ON CONFLICT ("key") DO NOTHING;
