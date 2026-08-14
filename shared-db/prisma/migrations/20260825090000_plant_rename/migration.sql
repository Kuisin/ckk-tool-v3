-- factory → plant 全面リネーム（挙動中立）。
-- 工場（factories）を「拠点（plants）」へ一般化する準備: テーブル・全 FK 列・
-- 制約/インデックス名・SCOPE enum 値（FACTORY→PLANT）を一括リネームする。
-- user_permissions ビューは scope の CASE に 'FACTORY' リテラルを含むため
-- 一旦 DROP し、'PLANT' で再作成する（定義はそれ以外 init と同一）。
-- ロールバックは逆方向の RENAME（このファイル末尾のコメント参照）。

-- ── view: drop（enum 値リテラルを参照しているため先に落とす） ─────────────
DROP VIEW "app"."user_permissions";

-- ── enum 値リネーム（PG17: トランザクション内で可） ──────────────────────
ALTER TYPE "app"."SCOPE" RENAME VALUE 'FACTORY' TO 'PLANT';

-- ── テーブル本体 ─────────────────────────────────────────────────────────
ALTER TABLE "app"."factories" RENAME TO "plants";
ALTER SEQUENCE "app"."factories_id_seq" RENAME TO "plants_id_seq";
ALTER INDEX "app"."factories_pkey" RENAME TO "plants_pkey";
ALTER INDEX "app"."factories_code_key" RENAME TO "plants_code_key";

-- ── FK 列リネーム（12 列） ───────────────────────────────────────────────
ALTER TABLE "app"."work_order_steps" RENAME COLUMN "factory_id" TO "plant_id";
ALTER TABLE "app"."product_inventory" RENAME COLUMN "factory_id" TO "plant_id";
ALTER TABLE "app"."material_inventory" RENAME COLUMN "factory_id" TO "plant_id";
ALTER TABLE "app"."storage_locations" RENAME COLUMN "factory_id" TO "plant_id";
ALTER TABLE "app"."work_location_groups" RENAME COLUMN "factory_id" TO "plant_id";
ALTER TABLE "app"."material_purchase_order_items" RENAME COLUMN "factory_id" TO "plant_id";
ALTER TABLE "app"."material_receipts" RENAME COLUMN "factory_id" TO "plant_id";
ALTER TABLE "app"."purchase_request_items" RENAME COLUMN "factory_id" TO "plant_id";
ALTER TABLE "app"."product_process_route_version_steps" RENAME COLUMN "factory_id" TO "plant_id";
ALTER TABLE "app"."kiosk_devices" RENAME COLUMN "factory_id" TO "plant_id";
ALTER TABLE "app"."kiosk_floor_maps" RENAME COLUMN "factory_id" TO "plant_id";
ALTER TABLE "app"."shipping_orders" RENAME COLUMN "from_factory_id" TO "from_plant_id";

-- ── FK 制約名（Prisma 既定命名へ揃える — 以後の migrate diff を空に保つ） ──
ALTER TABLE "app"."work_order_steps" RENAME CONSTRAINT "work_order_steps_factory_id_fkey" TO "work_order_steps_plant_id_fkey";
ALTER TABLE "app"."product_inventory" RENAME CONSTRAINT "product_inventory_factory_id_fkey" TO "product_inventory_plant_id_fkey";
ALTER TABLE "app"."material_inventory" RENAME CONSTRAINT "material_inventory_factory_id_fkey" TO "material_inventory_plant_id_fkey";
ALTER TABLE "app"."storage_locations" RENAME CONSTRAINT "storage_locations_factory_id_fkey" TO "storage_locations_plant_id_fkey";
ALTER TABLE "app"."work_location_groups" RENAME CONSTRAINT "work_location_groups_factory_id_fkey" TO "work_location_groups_plant_id_fkey";
ALTER TABLE "app"."material_purchase_order_items" RENAME CONSTRAINT "material_purchase_order_items_factory_id_fkey" TO "material_purchase_order_items_plant_id_fkey";
ALTER TABLE "app"."material_receipts" RENAME CONSTRAINT "material_receipts_factory_id_fkey" TO "material_receipts_plant_id_fkey";
ALTER TABLE "app"."purchase_request_items" RENAME CONSTRAINT "purchase_request_items_factory_id_fkey" TO "purchase_request_items_plant_id_fkey";
ALTER TABLE "app"."product_process_route_version_steps" RENAME CONSTRAINT "product_process_route_version_steps_factory_id_fkey" TO "product_process_route_version_steps_plant_id_fkey";
ALTER TABLE "app"."kiosk_devices" RENAME CONSTRAINT "kiosk_devices_factory_id_fkey" TO "kiosk_devices_plant_id_fkey";
ALTER TABLE "app"."kiosk_floor_maps" RENAME CONSTRAINT "kiosk_floor_maps_factory_id_fkey" TO "kiosk_floor_maps_plant_id_fkey";
ALTER TABLE "app"."shipping_orders" RENAME CONSTRAINT "shipping_orders_from_factory_id_fkey" TO "shipping_orders_from_plant_id_fkey";

-- ── インデックス名 ───────────────────────────────────────────────────────
ALTER INDEX "app"."kiosk_devices_factory_id_idx" RENAME TO "kiosk_devices_plant_id_idx";
ALTER INDEX "app"."kiosk_floor_maps_factory_id_idx" RENAME TO "kiosk_floor_maps_plant_id_idx";
ALTER INDEX "app"."storage_locations_factory_id_idx" RENAME TO "storage_locations_plant_id_idx";
-- product_inventory_bucket_key / material_inventory_bucket_key はカスタム名
-- （factory を含まない）のためそのまま。定義は列 attnum 参照なので自動追従。

-- ── view: 再作成（init と同一定義、CASE のみ 'PLANT'） ────────────────────
CREATE VIEW "app"."user_permissions" AS
 SELECT DISTINCT ON (urr.user_id, rpr.action, rpr.permission_code)
    urr.user_id,
    rpr.action,
    rpr.permission_code,
    rpr.scope,
    rpr.scope_custom
   FROM "app"."user_role_relation" urr
     JOIN "app"."roles" r ON r.id = urr.role_id
     JOIN "app"."role_permission_relation" rpr ON rpr.role_id = urr.role_id
   WHERE urr.is_active
     AND (urr.deactivate_at IS NULL OR urr.deactivate_at > now())
   ORDER BY urr.user_id, rpr.action, rpr.permission_code,
     CASE rpr.scope
       WHEN 'ALL' THEN 0
       WHEN 'REGION' THEN 1
       WHEN 'COUNTRY' THEN 2
       WHEN 'PLANT' THEN 3
       WHEN 'DEPARTMENT' THEN 4
       WHEN 'TEAM' THEN 5
       WHEN 'SUB' THEN 6
       WHEN 'OWN' THEN 7
     END;

-- ビューは再作成なので権限を再付与。role が無い環境（shadow DB・検証用
-- スクラッチ DB）ではスキップ — 実環境では grants.sql の再実行でも同じ結果。
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app') THEN
    GRANT SELECT ON "app"."user_permissions" TO "app";
  END IF;
END $$;

-- ── アプリキー改名の追従（master-factories → master-plants） ─────────────
-- feature_flags は `app:<key>:<env>`、user_home_settings は key の JSON 配列を
-- 保持するため、リネームに合わせてデータも書き換える（いずれも冪等）。
UPDATE "app"."feature_flags"
   SET key = replace(key, ':master-factories:', ':master-plants:')
 WHERE key LIKE '%:master-factories:%';

UPDATE "app"."user_home_settings"
   SET starred = replace(starred::text, '"master-factories"', '"master-plants"')::jsonb
 WHERE starred::text LIKE '%"master-factories"%';

UPDATE "app"."user_home_settings"
   SET groups = replace(groups::text, '"master-factories"', '"master-plants"')::jsonb
 WHERE groups::text LIKE '%"master-factories"%';

-- ── ロールバック（手動 down）: 上記の RENAME を逆順・逆方向に適用し、
--    ビューを 'FACTORY' 版で再作成する。データ変更は一切ないため安全。
