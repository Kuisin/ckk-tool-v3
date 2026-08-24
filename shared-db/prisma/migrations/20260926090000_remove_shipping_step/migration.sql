-- 出荷（SHIPPING）工程の廃止 — 出荷は指示書（WO）の工程ではなく出荷書（DO）が管理する。
--
-- 出荷前検査（PRE_SHIP_INSPECTION）は WO の任意工程として残る（常に末尾）。
-- SHIPPING は quantity_tracking = NONE のパススルー工程で、グラフ終端の
-- 完成数計算（computeFinishedQuantity）にも在庫計上（onWorkOrderCompleted）にも
-- 影響しないため、既存指示書から取り除いても数量・在庫の意味は変わらない。
--
-- スキーマ変更なし・マスタ/データ掃除のみ（冪等）:
--   1. 使用依存（SHIPPING → 出荷前検査 の 1 行）を削除
--   2. 既存指示書の出荷工程行を削除（計画/実績/リンク/検査記録/検査表割当は FK CASCADE）
--   3. 工程ルートのバージョン行に SHIPPING があれば削除（seed には無い — 保険）
--   4. カタログ行を削除
-- PG enum PROCESS_CATEGORY の 'SHIPPING' 値は残す（enum 値の削除は破壊的で益なし）。

-- 1. 使用依存（step_id 側・depends_on 側の両方）
DELETE FROM "app"."process_step_use_dependencies"
WHERE "step_id" IN (SELECT "id" FROM "app"."process_step_catalog" WHERE "code" = 'SHIPPING')
   OR "depends_on_step_id" IN (SELECT "id" FROM "app"."process_step_catalog" WHERE "code" = 'SHIPPING');

DELETE FROM "app"."process_step_exec_dependencies"
WHERE "step_id" IN (SELECT "id" FROM "app"."process_step_catalog" WHERE "code" = 'SHIPPING')
   OR "depends_on_step_id" IN (SELECT "id" FROM "app"."process_step_catalog" WHERE "code" = 'SHIPPING');

-- 2. 既存指示書の出荷工程（子行は全て ON DELETE CASCADE）
DELETE FROM "app"."work_order_steps"
WHERE "process_step_id" IN (SELECT "id" FROM "app"."process_step_catalog" WHERE "code" = 'SHIPPING');

-- 3. 工程ルートのバージョン行（保険 — seed には存在しない）
DELETE FROM "app"."product_process_route_version_steps"
WHERE "process_step_id" IN (SELECT "id" FROM "app"."process_step_catalog" WHERE "code" = 'SHIPPING');

-- 4. カタログ行
DELETE FROM "app"."process_step_catalog" WHERE "code" = 'SHIPPING';
