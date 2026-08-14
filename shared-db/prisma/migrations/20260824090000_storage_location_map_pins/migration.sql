-- 保管場所のフロアマップピン。フロアマップ（kiosk_floor_maps）を端末管理と
-- 共用し、保管場所（storage_locations）も同じ図面上に %座標で配置する。

ALTER TABLE "app"."storage_locations"
  ADD COLUMN "floor_map_id" UUID,
  ADD COLUMN "map_x" DECIMAL(5,2),
  ADD COLUMN "map_y" DECIMAL(5,2);

ALTER TABLE "app"."storage_locations"
  ADD CONSTRAINT "storage_locations_floor_map_id_fkey"
  FOREIGN KEY ("floor_map_id") REFERENCES "app"."kiosk_floor_maps"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
