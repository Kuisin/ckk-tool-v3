-- 表示設定に「アプリの書体」を足す（本人が /profile/preferences で変える。
-- text_scale / bold_text と同じ並び — 20260923090000_display_text_scale 参照）。
--
-- PDF は対象外・常に埋め込み Noto Sans JP のまま（lib/pdf.ts が同梱フォントを
-- アップロードする側で、この列は届かない）。
ALTER TABLE "app"."users"
  ADD COLUMN "font_family" VARCHAR(8) NOT NULL DEFAULT 'noto';

-- date_format / text_scale と同じく、値の集合は DB 側でも閉じる。
ALTER TABLE "app"."users"
  ADD CONSTRAINT "users_font_family_check"
  CHECK ("font_family" IN ('noto', 'system'));
