-- 外部リンクの索引（短縮リンク）とブロック指定を追加する。
--
--   link_index     … リッチテキスト中の外部 URL → 短縮コード。本文には
--                    `/l/<code>` を保存し、実 URL はこの表だけが持つ。
--                    閲覧者は確認ページで遷移先を見てから外部へ進む。
--   link_blacklist … ブロックするホスト名（サフィックス一致）。判定は保存時と
--                    **クリック時**の両方で行うので、後から足したルールが
--                    既存リンクにも遡って効く。
--
-- 純粋な追加のみ。既存テーブル・既存データには触れない。
-- 既存メモ本文の URL 取り込みは別途べき等スクリプトで行う
--   （shared-db/scripts/backfill-link-index.mjs）。
-- ロールバック:
--   DROP TABLE "app"."link_index"; DROP TABLE "app"."link_blacklist";

-- CreateTable
CREATE TABLE "app"."link_index" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "hostname" TEXT NOT NULL,
    "hit_count" INTEGER NOT NULL DEFAULT 0,
    "last_used_at" TIMESTAMPTZ(6),
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "link_index_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."link_blacklist" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "pattern" TEXT NOT NULL,
    "reason" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "link_blacklist_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "link_index_code_key" ON "app"."link_index"("code");

-- CreateIndex
CREATE UNIQUE INDEX "link_index_url_key" ON "app"."link_index"("url");

-- CreateIndex
CREATE INDEX "link_index_hostname_idx" ON "app"."link_index"("hostname");

-- CreateIndex
CREATE UNIQUE INDEX "link_blacklist_pattern_key" ON "app"."link_blacklist"("pattern");

-- AddForeignKey
ALTER TABLE "app"."link_index" ADD CONSTRAINT "link_index_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "app"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."link_blacklist" ADD CONSTRAINT "link_blacklist_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "app"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

