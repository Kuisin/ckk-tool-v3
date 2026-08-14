-- RBAC スコープ基盤: 地域マスタ / ユーザー×拠点 / grant 単位のスコープ値。
--
-- 1. app.regions — 拠点をグループ化する地域マスタ（scope_values は code 参照）
-- 2. app.plants.region_id — 拠点→地域（任意）
-- 3. app.user_plants — ユーザーの所属拠点（多対多。PLANT/REGION スコープ解決の基盤）
-- 4. role_permission_relation.scope_values text[] DEFAULT '{*}'
--    - PLANT: '*' = 所属拠点全部 / 拠点 code 列挙 = 列挙 ∩ 所属
--    - REGION: '*' = 所属拠点の地域の全拠点 / 地域 code 列挙 = その地域の全拠点
--    未使用だった scope_custom は廃止（どこからも読まれていない — 表示のみ対応済み）
-- 5. user_permissions ビュー再設計:
--    - DISTINCT ON（最広スコープ 1 行への collapse）を廃止 — scope_values の
--      和集合をアプリ側（@ckk/authz-core decide()）で解決するため全 grant 行を返す
--    - users.is_active を JOIN — 無効化ユーザーは既存セッションでも即権限ゼロ
--    - 参照されていなかった roles JOIN を削除
--    列契約: (user_id, action, permission_code, scope, scope_values)
--    ※ (user_id, action, permission_code) は一意でなくなる。既存の存在チェック
--      型の消費者（authz / bug-report / preview）はすべて多行に不変。

-- ── 旧ビューを先に落とす（scope_custom への依存があるため） ──────────────
DROP VIEW "app"."user_permissions";

-- ── regions ──────────────────────────────────────────────────────────────
CREATE TABLE "app"."regions" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" JSONB NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "regions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "regions_code_key" ON "app"."regions"("code");

-- ── plants.region_id ─────────────────────────────────────────────────────
ALTER TABLE "app"."plants" ADD COLUMN "region_id" INTEGER;

ALTER TABLE "app"."plants" ADD CONSTRAINT "plants_region_id_fkey"
  FOREIGN KEY ("region_id") REFERENCES "app"."regions"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "plants_region_id_idx" ON "app"."plants"("region_id");

-- ── user_plants ──────────────────────────────────────────────────────────
CREATE TABLE "app"."user_plants" (
    "user_id" UUID NOT NULL,
    "plant_id" INTEGER NOT NULL,
    "assigned_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assigned_by" UUID,

    CONSTRAINT "user_plants_pkey" PRIMARY KEY ("user_id","plant_id")
);

CREATE INDEX "user_plants_plant_id_idx" ON "app"."user_plants"("plant_id");

ALTER TABLE "app"."user_plants" ADD CONSTRAINT "user_plants_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "app"."users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "app"."user_plants" ADD CONSTRAINT "user_plants_plant_id_fkey"
  FOREIGN KEY ("plant_id") REFERENCES "app"."plants"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "app"."user_plants" ADD CONSTRAINT "user_plants_assigned_by_fkey"
  FOREIGN KEY ("assigned_by") REFERENCES "app"."users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- ── scope_values / scope_custom ──────────────────────────────────────────
ALTER TABLE "app"."role_permission_relation"
  ADD COLUMN "scope_values" TEXT[] NOT NULL DEFAULT ARRAY['*']::TEXT[];

ALTER TABLE "app"."role_permission_relation" DROP COLUMN "scope_custom";

-- ── user_permissions ビュー再設計 ────────────────────────────────────────
CREATE VIEW "app"."user_permissions" AS
 SELECT
    urr.user_id,
    rpr.action,
    rpr.permission_code,
    rpr.scope,
    rpr.scope_values
   FROM "app"."user_role_relation" urr
     JOIN "app"."users" u ON u.id = urr.user_id AND u.is_active
     JOIN "app"."role_permission_relation" rpr ON rpr.role_id = urr.role_id
  WHERE urr.is_active
    AND (urr.deactivate_at IS NULL OR urr.deactivate_at > now());

-- role が無い環境（shadow / スクラッチ検証）ではスキップ。
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app') THEN
    GRANT SELECT ON "app"."user_permissions" TO "app";
  END IF;
END $$;
