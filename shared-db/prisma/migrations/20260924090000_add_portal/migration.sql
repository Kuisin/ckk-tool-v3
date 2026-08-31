-- 取引先ポータル — 社外の人（取引先・需要家）が自社宛の書類と進捗を見るための基盤。
--
-- ログインは事前登録メールへの OTP（パスワードなし）。メールが受け取れない
-- ときの代替として、事前発行のバックアップコードと、書類 1 件に絞ったトークン
-- URL を持つ。アカウントは管理者が明示的に有効化したものだけが使える
-- （is_active の既定が false なのはそのため）。
--
-- ■ app.users を使わない
-- ポータルの主体は app.users とは別の PortalAccount。GUEST の users 行にすると、
-- 社員を前提にした既存の問い合わせ（ユーザー一覧・承認グループのメンバー選択・
-- 共有先のピッカー・「全員」への通知の宛先展開）すべてに「社外を除く」という
-- 否定の規律が要り、抜けたときの失敗が静かになる。
--
-- ■ 認可の源は portal_grants 一本
-- portal_accounts.bp_id は所属の表示用で、それ自体は何も許可しない。判定は
-- share_grants と同じ「当てはまる行の和集合・否定行なし・fail-closed」
-- （lib/portal-access-core.ts）。
--
-- ■ 生の資格情報を DB に残さない
-- セッション/リンクのトークンは sha256 だけ（生値は Cookie と URL にしかない）、
-- OTP とバックアップコードは scrypt、未登録アドレスは HMAC の相関キーだけ。
--
-- ■ 公開範囲
-- アプリ側の入口 /portal は src/config/dev-features.json が dev 限定に閉じている。
-- feature_flags を使わないのは、dev と main が同じ DB を共有していて、DB の行 1 つで
-- 本番が開いてしまうため。
--
-- 個人データを含むので login_attempts と同じ 3 点セットで守る:
-- SY0H を権限で閉じる / grants.sql で metabase_ro から剥がす / portal-cron.sql で刈る。

-- AlterTable
ALTER TABLE "app"."login_attempts" ADD COLUMN     "portal_account_id" UUID;

-- CreateTable
CREATE TABLE "app"."portal_accounts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "bp_id" UUID NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "email_ref" CHAR(64) NOT NULL,
    "display_name" TEXT NOT NULL,
    "bp_contact_id" UUID,
    "locale" VARCHAR(8) NOT NULL DEFAULT 'ja',
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "disabled_at" TIMESTAMPTZ(6),
    "disabled_reason" TEXT,
    "disabled_by" UUID,
    "last_login_at" TIMESTAMPTZ(6),
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "portal_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."portal_grants" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "portal_account_id" UUID NOT NULL,
    "kind" VARCHAR(16) NOT NULL,
    "bp_id" UUID,
    "include_branches" BOOLEAN NOT NULL DEFAULT true,
    "include_as_end_user" BOOLEAN NOT NULL DEFAULT false,
    "resource_type" VARCHAR(32),
    "resource_id" TEXT,
    "condition_field_key" TEXT,
    "condition_values" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "expires_at" TIMESTAMPTZ(6),
    "revoked_at" TIMESTAMPTZ(6),
    "revoked_by" UUID,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "portal_grants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."portal_sessions" (
    "id" CHAR(64) NOT NULL,
    "portal_account_id" UUID,
    "link_id" UUID,
    "method" VARCHAR(24) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "last_activity_at" TIMESTAMPTZ(6) NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),
    "ip_address" INET,
    "user_agent" VARCHAR(512),

    CONSTRAINT "portal_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."portal_document_links" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "token_hash" CHAR(64) NOT NULL,
    "resource_type" VARCHAR(32) NOT NULL,
    "resource_id" TEXT NOT NULL,
    "policy" VARCHAR(16) NOT NULL,
    "portal_account_id" UUID,
    "bound_email" VARCHAR(254),
    "bound_email_ref" CHAR(64),
    "label" TEXT,
    "max_uses" INTEGER,
    "use_count" INTEGER NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),
    "revoked_by" UUID,
    "last_used_at" TIMESTAMPTZ(6),
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "portal_document_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."portal_login_challenges" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "challenge_ref" CHAR(43) NOT NULL,
    "portal_account_id" UUID,
    "link_id" UUID,
    "email_ref" CHAR(64) NOT NULL,
    "code_hash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "consumed_at" TIMESTAMPTZ(6),
    "last_ip_address" INET,
    "user_agent" VARCHAR(512),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "portal_login_challenges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."portal_backup_codes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "portal_account_id" UUID NOT NULL,
    "code_hash" TEXT NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "used_at" TIMESTAMPTZ(6),
    "used_ip" INET,
    "issued_by" UUID,
    "issued_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "portal_backup_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."portal_rate_limits" (
    "bucket" VARCHAR(24) NOT NULL,
    "key_ref" CHAR(64) NOT NULL,
    "failures" INTEGER NOT NULL DEFAULT 0,
    "window_started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "locked_until" TIMESTAMPTZ(6),
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "portal_rate_limits_pkey" PRIMARY KEY ("bucket","key_ref")
);

-- CreateTable
CREATE TABLE "app"."portal_access_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "portal_account_id" UUID,
    "link_id" UUID,
    "resource_type" VARCHAR(32) NOT NULL,
    "resource_id" TEXT NOT NULL,
    "action" VARCHAR(16) NOT NULL,
    "ip_address" INET,
    "user_agent" VARCHAR(512),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "portal_access_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "portal_accounts_email_key" ON "app"."portal_accounts"("email");

-- CreateIndex
CREATE INDEX "portal_accounts_bp_id_idx" ON "app"."portal_accounts"("bp_id");

-- CreateIndex
CREATE INDEX "portal_accounts_email_ref_idx" ON "app"."portal_accounts"("email_ref");

-- CreateIndex
CREATE INDEX "portal_grants_portal_account_id_idx" ON "app"."portal_grants"("portal_account_id");

-- CreateIndex
CREATE UNIQUE INDEX "portal_grants_portal_account_id_kind_resource_type_resource_key" ON "app"."portal_grants"("portal_account_id", "kind", "resource_type", "resource_id", "bp_id");

-- CreateIndex
CREATE INDEX "portal_sessions_portal_account_id_idx" ON "app"."portal_sessions"("portal_account_id");

-- CreateIndex
CREATE INDEX "portal_sessions_expires_at_idx" ON "app"."portal_sessions"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "portal_document_links_token_hash_key" ON "app"."portal_document_links"("token_hash");

-- CreateIndex
CREATE INDEX "portal_document_links_resource_type_resource_id_idx" ON "app"."portal_document_links"("resource_type", "resource_id");

-- CreateIndex
CREATE INDEX "portal_document_links_expires_at_idx" ON "app"."portal_document_links"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "portal_login_challenges_challenge_ref_key" ON "app"."portal_login_challenges"("challenge_ref");

-- CreateIndex
CREATE INDEX "portal_login_challenges_expires_at_idx" ON "app"."portal_login_challenges"("expires_at");

-- CreateIndex
CREATE INDEX "portal_login_challenges_email_ref_created_at_idx" ON "app"."portal_login_challenges"("email_ref", "created_at" DESC);

-- CreateIndex
CREATE INDEX "portal_backup_codes_portal_account_id_used_at_idx" ON "app"."portal_backup_codes"("portal_account_id", "used_at");

-- CreateIndex
CREATE UNIQUE INDEX "portal_backup_codes_portal_account_id_ordinal_key" ON "app"."portal_backup_codes"("portal_account_id", "ordinal");

-- CreateIndex
CREATE INDEX "portal_rate_limits_updated_at_idx" ON "app"."portal_rate_limits"("updated_at");

-- CreateIndex
CREATE INDEX "portal_access_logs_portal_account_id_created_at_idx" ON "app"."portal_access_logs"("portal_account_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "portal_access_logs_resource_type_resource_id_created_at_idx" ON "app"."portal_access_logs"("resource_type", "resource_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "portal_access_logs_created_at_idx" ON "app"."portal_access_logs"("created_at" DESC);

-- CreateIndex
CREATE INDEX "login_attempts_portal_account_id_created_at_idx" ON "app"."login_attempts"("portal_account_id", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "app"."portal_accounts" ADD CONSTRAINT "portal_accounts_bp_id_fkey" FOREIGN KEY ("bp_id") REFERENCES "app"."business_partners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."portal_accounts" ADD CONSTRAINT "portal_accounts_bp_contact_id_fkey" FOREIGN KEY ("bp_contact_id") REFERENCES "app"."bp_contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."portal_accounts" ADD CONSTRAINT "portal_accounts_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "app"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."portal_accounts" ADD CONSTRAINT "portal_accounts_disabled_by_fkey" FOREIGN KEY ("disabled_by") REFERENCES "app"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."portal_grants" ADD CONSTRAINT "portal_grants_portal_account_id_fkey" FOREIGN KEY ("portal_account_id") REFERENCES "app"."portal_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."portal_grants" ADD CONSTRAINT "portal_grants_bp_id_fkey" FOREIGN KEY ("bp_id") REFERENCES "app"."business_partners"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."portal_grants" ADD CONSTRAINT "portal_grants_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "app"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."portal_grants" ADD CONSTRAINT "portal_grants_revoked_by_fkey" FOREIGN KEY ("revoked_by") REFERENCES "app"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."portal_sessions" ADD CONSTRAINT "portal_sessions_portal_account_id_fkey" FOREIGN KEY ("portal_account_id") REFERENCES "app"."portal_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."portal_sessions" ADD CONSTRAINT "portal_sessions_link_id_fkey" FOREIGN KEY ("link_id") REFERENCES "app"."portal_document_links"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."portal_document_links" ADD CONSTRAINT "portal_document_links_portal_account_id_fkey" FOREIGN KEY ("portal_account_id") REFERENCES "app"."portal_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."portal_document_links" ADD CONSTRAINT "portal_document_links_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "app"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."portal_document_links" ADD CONSTRAINT "portal_document_links_revoked_by_fkey" FOREIGN KEY ("revoked_by") REFERENCES "app"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."portal_login_challenges" ADD CONSTRAINT "portal_login_challenges_portal_account_id_fkey" FOREIGN KEY ("portal_account_id") REFERENCES "app"."portal_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."portal_login_challenges" ADD CONSTRAINT "portal_login_challenges_link_id_fkey" FOREIGN KEY ("link_id") REFERENCES "app"."portal_document_links"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."portal_backup_codes" ADD CONSTRAINT "portal_backup_codes_portal_account_id_fkey" FOREIGN KEY ("portal_account_id") REFERENCES "app"."portal_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."portal_backup_codes" ADD CONSTRAINT "portal_backup_codes_issued_by_fkey" FOREIGN KEY ("issued_by") REFERENCES "app"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."portal_access_logs" ADD CONSTRAINT "portal_access_logs_portal_account_id_fkey" FOREIGN KEY ("portal_account_id") REFERENCES "app"."portal_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."portal_access_logs" ADD CONSTRAINT "portal_access_logs_link_id_fkey" FOREIGN KEY ("link_id") REFERENCES "app"."portal_document_links"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."login_attempts" ADD CONSTRAINT "login_attempts_portal_account_id_fkey" FOREIGN KEY ("portal_account_id") REFERENCES "app"."portal_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
