-- 表示設定に「文字の大きさ」と「文字を太くする」を足す（本人が
-- /profile/preferences で変える。locale / date_format と同じ並び）。
--
-- 倍率（md = 1.0）は列に持たない。持つのは段の名前だけで、実際の倍率は
-- アプリ側（lib/user-preferences-core.ts）の 1 か所が決める — 刻みを直したく
-- なったときに、保存済みの全ユーザー行を書き換えずに済ませるため。
ALTER TABLE "app"."users"
  ADD COLUMN "text_scale" VARCHAR(8) NOT NULL DEFAULT 'md',
  ADD COLUMN "bold_text"  BOOLEAN    NOT NULL DEFAULT false;

-- date_format / time_format と同じく、値の集合は DB 側でも閉じる
-- （アプリを経由しない書き込みで画面が壊れないように）。
ALTER TABLE "app"."users"
  ADD CONSTRAINT "users_text_scale_check"
  CHECK ("text_scale" IN ('xs', 'sm', 'md', 'lg', 'xl'));
