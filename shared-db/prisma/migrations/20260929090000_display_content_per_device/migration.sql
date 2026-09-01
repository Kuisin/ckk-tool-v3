-- allow-destructive: display_profiles は 0 行、display_devices の 1 行（dev の
-- 動作確認用「Test」）も display_profile_id が NULL。**消える中身が無い。**
-- ディスプレイ機能はまだ dev 限定（dev-features）で実機も 0 台。
-- 実機が付いたあとに同じことをするなら、素直に expand / contract へ分けること。

-- 管理ディスプレイ: 何を映すかを**画面ごとに直接持たせる**。
--
-- 以前は「表示内容（display_profiles）」を別に作って端末へ割り当てる形だった。
-- しかし壁のテレビは 1 枚 1 用途がほとんどで共有する場面がまず無く、1 枚しか
-- 使わない現場でも 2 つのものを作って結ぶ必要があった。しかも作った直後の
-- 画面は「未割当」で何も映らない（dev の Test がまさにその状態だった）。
--
-- そこで端末の設定として持つ。既定値を入れてあるので、**作った時点で
-- 生産状況が映る**（何も選ばなくても黒い画面にならない）。

ALTER TABLE "app"."display_devices"
  ADD COLUMN "content_type" "app"."DISPLAY_CONTENT_TYPE" NOT NULL DEFAULT 'APP_PAGE',
  ADD COLUMN "content_config" JSONB NOT NULL DEFAULT '{"page": "production", "options": {}}',
  ADD COLUMN "refresh_interval_sec" INTEGER NOT NULL DEFAULT 60;

-- 割り当てをやめるので参照を落とす
ALTER TABLE "app"."display_devices" DROP CONSTRAINT "display_devices_display_profile_id_fkey";
DROP INDEX "app"."display_devices_display_profile_id_idx";
ALTER TABLE "app"."display_devices" DROP COLUMN "display_profile_id";

CREATE INDEX "display_devices_content_type_idx" ON "app"."display_devices"("content_type");

-- 表示内容テーブルはもう使わない
DROP TABLE "app"."display_profiles";
