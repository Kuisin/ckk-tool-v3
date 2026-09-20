-- 再研磨 第 2 段: 共通の再研磨工程リストを許し、再研磨工程をカタログに足す。
-- （前の migration で足した enum 値をここで初めて使う — 同じトランザクションの
-- 中では使えないため 2 つに分けている。）
--
-- ## 再研磨工程リストは製品にも顧客にも紐づかない
--
-- 準備工程リスト（PREP）と同じ「共通」のリスト。研ぎ直しの手順は工具の
-- 品目ごとに変わるものではなく、「外周 + 溝 → コート → 検査」のような定番を
-- 何本か持てば足りる。製品 × 受注元ごとの製造工程リスト（MANUFACTURING）と
-- 違い、item_id / customer_bp_id は必ず NULL。
ALTER TABLE "app"."product_process_routes" DROP CONSTRAINT IF EXISTS "product_process_routes_kind_columns";
ALTER TABLE "app"."product_process_routes"
  ADD CONSTRAINT "product_process_routes_kind_columns"
  CHECK (
    ("kind" IN ('PREP', 'REGRIND') AND "item_id" IS NULL AND "customer_bp_id" IS NULL)
    OR ("kind" = 'MANUFACTURING' AND "item_id" IS NOT NULL)
  );

-- ## 再研磨の工程
--
-- id は採らない（seq は 42 まで進んでいる）。code で冪等。
--
-- 製品受入（再研磨）は再研磨指示書の**開始工程**（lib/workflow-core.ts の
-- START_STEP_CODES）。数量欄の読み方が普通の工程と違う:
--   受入数   = 受入本数（顧客から届いた本数。予定数量と違ってよい）
--   良品数   = 再研磨する本数（後工程へ流れる）
--   廃棄     = 返却本数（再研磨できずそのまま返す本数）
--   ロット欄 = 箱番号（任意）
-- 完了時に受入数を顧客所有の在庫（item_inventory.owner_bp_id）へ入庫する。
-- 作業場所は要らない（受け取るだけ）。
--
-- 研磨工程の sort_order は SMAP(350) と COATING(360) の間 — 既定順で
-- コーティングより前に並ぶように。360 以上にすると研磨がコートの後ろへ行く。
-- 再研磨検査は検査群と出荷前検査(400) の間。
INSERT INTO app.process_step_catalog
  (code, name, category, execution_location, is_sync_capable, is_inspection, is_approval_step,
   approval_min_rank, sort_order, is_active, notes, quantity_tracking, default_work_hours, lot_input_mode,
   is_final_inspection, work_location_required, plan_time_required, plan_assignee_required, plan_quantity_required)
VALUES
  ('REGRIND_RECEIPT', '{"ja":"製品受入（再研磨）","en":"Tool receipt (regrind)","zh":"产品接收（再研磨）"}', 'REGRIND', 'INTERNAL', false, false, false,
     NULL, 26, true, '再研磨指示書の開始工程。完了時に受入数を預り品として入庫する。廃棄欄 = 返却本数（再研磨不可）、ロット欄 = 箱番号', 'FLOW', NULL, 'OPTIONAL',
     false, false, false, false, false),
  ('REGRIND_OD',      '{"ja":"外周研磨","en":"OD regrind","zh":"外周研磨"}',            'REGRIND', 'INTERNAL', true,  false, false, NULL, 352, true, '他工程と同時実施・同時記録可', 'FLOW', NULL, 'NONE', false, true, false, false, false),
  ('REGRIND_FLUTE',   '{"ja":"溝研磨","en":"Flute regrind","zh":"沟槽研磨"}',           'REGRIND', 'INTERNAL', true,  false, false, NULL, 353, true, '他工程と同時実施・同時記録可', 'FLOW', NULL, 'NONE', false, true, false, false, false),
  ('REGRIND_TIP',     '{"ja":"先端研磨","en":"Tip regrind","zh":"前端研磨"}',           'REGRIND', 'INTERNAL', true,  false, false, NULL, 354, true, NULL, 'FLOW', NULL, 'NONE', false, true, false, false, false),
  ('REGRIND_RADIUS',  '{"ja":"R研磨","en":"Corner radius regrind","zh":"R 角研磨"}',    'REGRIND', 'INTERNAL', true,  false, false, NULL, 355, true, NULL, 'FLOW', NULL, 'NONE', false, true, false, false, false),
  ('REGRIND_CHAMFER', '{"ja":"C研磨","en":"Corner chamfer regrind","zh":"C 角研磨"}',   'REGRIND', 'INTERNAL', true,  false, false, NULL, 356, true, NULL, 'FLOW', NULL, 'NONE', false, true, false, false, false),
  ('REGRIND_CUT',     '{"ja":"切断（再研磨）","en":"Cut-off (regrind)","zh":"切断（再研磨）"}', 'REGRIND', 'INTERNAL', false, false, false, NULL, 357, true, '切断 + 再生', 'FLOW', NULL, 'NONE', false, true, false, false, false),
  ('REGRIND_INSPECTION', '{"ja":"再研磨検査","en":"Regrind inspection","zh":"再研磨检查"}', 'INSPECTION', 'INTERNAL', false, true, false, NULL, 385, true, '検査表の完成確認（再研磨）。出荷前検査でも代替可', 'INSPECTION', NULL, 'NONE', false, true, false, false, false)
ON CONFLICT (code) DO NOTHING;
