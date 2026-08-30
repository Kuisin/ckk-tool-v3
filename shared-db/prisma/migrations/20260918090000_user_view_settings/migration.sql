-- 画面ごとの個人設定（system_settings の個人版）。
--
-- 「この画面のこのタブは自分には要らない」といった見た目の好みを貯める。
-- 設定が増えるたびに列や表を足さないよう、key→JSON の 1 表にしてある
-- （system_settings と同じ考え方）。業務データは入れない。
--
-- 最初の利用者は 承認・予定 (CM01) のタブ表示設定
-- （key = 'general.tasks.tabs' / value = { "hidden": ["comments", ...] }）。
CREATE TABLE "app"."user_view_settings" (
  "user_id"    UUID           NOT NULL,
  "key"        TEXT           NOT NULL,
  "value"      JSONB          NOT NULL,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "user_view_settings_pkey" PRIMARY KEY ("user_id", "key")
);

-- ユーザーを消したら設定も消える（残しても指す先が無い）。
ALTER TABLE "app"."user_view_settings"
  ADD CONSTRAINT "user_view_settings_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "app"."users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
