-- CreateTable
CREATE TABLE "app"."api_clients" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(120) NOT NULL,
    "description" TEXT,
    "user_id" UUID NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "expires_at" TIMESTAMPTZ(6),
    "allowed_cidrs" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "last_used_at" TIMESTAMPTZ(6),
    "last_used_ip" INET,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),
    "revoked_by" UUID,
    "revoked_reason" TEXT,

    CONSTRAINT "api_clients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."api_client_tokens" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "client_id" UUID NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "last4" CHAR(4) NOT NULL,
    "label" VARCHAR(60),
    "expires_at" TIMESTAMPTZ(6),
    "last_used_at" TIMESTAMPTZ(6),
    "use_count" INTEGER NOT NULL DEFAULT 0,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMPTZ(6),
    "revoked_by" UUID,

    CONSTRAINT "api_client_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."api_access_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "client_id" UUID,
    "token_id" UUID,
    "method" VARCHAR(8) NOT NULL,
    "path" VARCHAR(256) NOT NULL,
    "status" INTEGER NOT NULL,
    "deny_reason" VARCHAR(32),
    "permission_code" VARCHAR(64),
    "duration_ms" INTEGER,
    "ip_address" INET,
    "forwarded_for" VARCHAR(200),
    "user_agent" VARCHAR(512),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "api_access_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "api_clients_name_key" ON "app"."api_clients"("name");

-- CreateIndex
CREATE UNIQUE INDEX "api_clients_user_id_key" ON "app"."api_clients"("user_id");

-- CreateIndex
CREATE INDEX "api_clients_is_active_idx" ON "app"."api_clients"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "api_client_tokens_token_hash_key" ON "app"."api_client_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "api_client_tokens_client_id_revoked_at_idx" ON "app"."api_client_tokens"("client_id", "revoked_at");

-- CreateIndex
CREATE INDEX "api_client_tokens_expires_at_idx" ON "app"."api_client_tokens"("expires_at");

-- CreateIndex
CREATE INDEX "api_access_logs_client_id_created_at_idx" ON "app"."api_access_logs"("client_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "api_access_logs_created_at_idx" ON "app"."api_access_logs"("created_at" DESC);

-- CreateIndex
CREATE INDEX "api_access_logs_deny_reason_created_at_idx" ON "app"."api_access_logs"("deny_reason", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "app"."api_clients" ADD CONSTRAINT "api_clients_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."api_clients" ADD CONSTRAINT "api_clients_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "app"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."api_clients" ADD CONSTRAINT "api_clients_revoked_by_fkey" FOREIGN KEY ("revoked_by") REFERENCES "app"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."api_client_tokens" ADD CONSTRAINT "api_client_tokens_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "app"."api_clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."api_client_tokens" ADD CONSTRAINT "api_client_tokens_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "app"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."api_client_tokens" ADD CONSTRAINT "api_client_tokens_revoked_by_fkey" FOREIGN KEY ("revoked_by") REFERENCES "app"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."api_access_logs" ADD CONSTRAINT "api_access_logs_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "app"."api_clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ===========================================================================
-- 表の説明（psql \d+ と Metabase のフィールド説明に出る）
-- ===========================================================================

COMMENT ON TABLE app.api_clients IS
  '外部 API（/api/v1）の資格情報。1 行 = 外部システム 1 つで、権限は user_id が指す group=SYSTEM のユーザーのロールが決める。is_active の既定は false（作っただけでは何も通らない）。';
COMMENT ON TABLE app.api_client_tokens IS
  'API トークン。生値は発行応答に 1 度だけ現れ、DB は sha256 のみ。1 クライアントにつき有効 2 本まで（無停止の差し替え用。上限は発行アクションが守る）。';
COMMENT ON TABLE app.api_access_logs IS
  '/api/v1 の全リクエスト記録（成功・失敗とも）。audit_logs に入れないのは、認証に失敗した要求には actor が居ないため（login_attempts と同じ理由）。deny_reason はここにしか無い — 応答はどの理由でも同一の 401。';

-- ===========================================================================
-- 権限コード api_client と、その特権ロール割当
--
-- なぜ system の再利用ではないのか: トークンの発行は「ロールを帯びた資格情報を
-- 作る」操作で、PIN を読むより強い。2026-09 に system / kiosk を割った理由
-- （粗いコードは「申請すれば誰でも」になる）がそのまま当てはまる。しかも
-- system:ADMIN は既にスーパーユーザーなので、system を使い回しても管理者には
-- 何も足さず、AI プロバイダや通知メールを見るための system:CREATE/UPDATE 保持者に
-- だけ扉を広げることになる。近いのは user_admin であって system ではない。
--
-- ■ 業務ロールには配らない
-- roles-seed.sql の 7 つの除外リストと rbac-seed.sql の staff 除外に api_client を
-- 足してある。除外し忘れると manager / viewer / 6 つの *_manager に「業務データを
-- 読めるトークンを発行できる」権限が黙って配られる（kiosk で一度起きた罠）。
-- ここでも念のため、既に配られていれば剥がす。
-- ===========================================================================

INSERT INTO app.permissions (code, display_name, description) VALUES
  ('api_client',
   '{"ja":"外部 API クライアントの管理","en":"API client administration"}',
   '{"ja":"外部 API の資格情報の作成・有効化・トークンの発行と失効","en":""}')
ON CONFLICT (code) DO NOTHING;

-- 業務ロールに紛れ込んでいたら剥がす（seed の除外を足す前に流れた場合の後始末）。
DELETE FROM app.role_permission_relation rpr
 USING app.roles r
 WHERE rpr.role_id = r.id
   AND rpr.permission_code = 'api_client'
   AND r.rolename IN ('manager','viewer','staff',
                      'sales_manager','purchasing_manager','production_manager',
                      'quality_manager','shipping_manager','accounting_manager');

-- 申請側: 一覧の閲覧と、クライアントの作成/更新。
-- 実際に「トークンを発行」「有効化」「ロールを割り当て」ができるかは
-- lib/privileged-access.ts の昇格（SY0G の承認）が別途決める。
INSERT INTO app.role_permission_relation (role_id, permission_code, action, scope)
SELECT r.id, 'api_client', g.action::app."ACTION", 'ALL'::app."SCOPE"
FROM app.roles r
CROSS JOIN (VALUES ('READ'),('CREATE'),('UPDATE')) AS g(action)
WHERE r.rolename = 'privileged_operator'
ON CONFLICT DO NOTHING;

-- 決裁側: APPROVE のみ（申請側のグラントは一切与えない — 自己承認を作らない）。
INSERT INTO app.role_permission_relation (role_id, permission_code, action, scope)
SELECT r.id, 'api_client', 'APPROVE'::app."ACTION", 'ALL'::app."SCOPE"
FROM app.roles r
WHERE r.rolename = 'privileged_approver'
ON CONFLICT DO NOTHING;
