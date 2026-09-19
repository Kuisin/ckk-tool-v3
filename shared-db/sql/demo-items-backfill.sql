-- demo-items-backfill.sql — デモシードが旧 id（product_id / material_id）だけで
-- 入れた行に、品目 id（item_id / product_item_id / material_item_id）を後付けする。
--
-- 品目統合の第 2 段（20261029〜20261031 の items_stage2*）は既存行を migration の
-- 中で埋めたが、撮影・E2E 用のデモシードは migration の**後**に旧 id だけで行を
-- 入れるので、そのままだと素材名が空（—）になり、製品の工程リストは
-- 「未登録」と出る（listProductRoutes が item_id で引くため）。第 3 段で旧列を
-- 落とすまでの間、デモシードの最後にこれを流す。冪等（NULL の行だけ埋める）。
-- 文は migration の backfill と同じもの（対応の定義を 2 つにしない）。
BEGIN;

UPDATE app.material_purchase_order_items t SET item_id = m.item_id FROM app.materials m WHERE m.id = t.material_id AND t.item_id IS NULL;
UPDATE app.material_receipts t              SET item_id = m.item_id FROM app.materials m WHERE m.id = t.material_id AND t.item_id IS NULL;
UPDATE app.purchase_request_items t         SET item_id = m.item_id FROM app.materials m WHERE m.id = t.material_id AND t.item_id IS NULL;
UPDATE app.work_orders t SET material_item_id = m.item_id FROM app.materials m WHERE m.id = t.material_id AND t.material_item_id IS NULL;
UPDATE app.work_orders t SET product_item_id  = p.item_id FROM app.products  p WHERE p.id = t.product_id  AND t.product_item_id IS NULL;
UPDATE app.product_process_routes t  SET item_id = p.item_id FROM app.products p WHERE p.id = t.product_id AND t.item_id IS NULL;
UPDATE app.inspection_templates t    SET item_id = p.item_id FROM app.products p WHERE p.id = t.product_id AND t.item_id IS NULL;
UPDATE app.design_requests t         SET item_id = p.item_id FROM app.products p WHERE p.id = t.product_id AND t.item_id IS NULL;
UPDATE app.design_files t            SET item_id = p.item_id FROM app.products p WHERE p.id = t.product_id AND t.item_id IS NULL;
UPDATE app.estimates t               SET item_id = p.item_id FROM app.products p WHERE p.id = t.product_id AND t.item_id IS NULL;
UPDATE app.price_list_entries t      SET item_id = p.item_id FROM app.products p WHERE p.id = t.product_id AND t.item_id IS NULL;
UPDATE app.quote_items t             SET item_id = p.item_id FROM app.products p WHERE p.id = t.product_id AND t.item_id IS NULL;
UPDATE app.order_lines t             SET item_id = p.item_id FROM app.products p WHERE p.id = t.product_id AND t.item_id IS NULL;
UPDATE app.delivery_order_items t    SET item_id = p.item_id FROM app.products p WHERE p.id = t.product_id AND t.item_id IS NULL;
UPDATE app.delivery_note_items t     SET item_id = p.item_id FROM app.products p WHERE p.id = t.product_id AND t.item_id IS NULL;
UPDATE app.customer_product_codes t  SET item_id = p.item_id FROM app.products p WHERE p.id = t.product_id AND t.item_id IS NULL;

COMMIT;
