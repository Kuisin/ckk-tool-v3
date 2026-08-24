-- directory.employee_directory.member_of に既定値 '{}' を付ける。
--
-- このテーブルは ldap-sync（vpn-ldap スタック）が CREATE TABLE IF NOT EXISTS で
-- 作る。その DDL は member_of に既定値を付けないので、**既存の DB だけ**
-- Prisma スキーマ（`String[] @default([])`）とズレていた。
-- ベースラインで新規に作られる DB には最初から入っている。
--
-- 既定値を足すだけ — 既存行は書き換わらないし、NOT NULL 化もしない
-- （NULL の行があると失敗するため。アプリは常に配列を書いている）。

ALTER TABLE "directory"."employee_directory"
  ALTER COLUMN "member_of" SET DEFAULT ARRAY[]::TEXT[];
