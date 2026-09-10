-- 製造工程リストの版から準備工程を取り除く（版そのものは残す）。
--
-- 20261013 の分割では、移行前の製造工程リストの版に混ざっていた準備工程
-- （〇〇出し・受渡し / 材料準備）をそのまま残し、比較・保存を種別の部分だけで
-- 行うことで凌いでいた。準備工程リストは共通で、指示書は常にその最新版を使う
-- ことに決まったので、製造側の版に準備工程が残っている理由が無くなった —
-- 残しておくと製品詳細の工程タブに「準備工程も含む版」が並び続け、どちらの
-- リストが正か読めない。
--
-- 版の行（product_process_route_versions）は消さない: 使用済み指示書の出所であり、
-- 版番号の履歴として残す。中身が準備工程だけだった版は空の版として残る。
-- どの工程が準備工程かは lib/workflow-core.ts isPrepStep と同じ規則
-- （process_step_catalog.category = MATERIAL_PREP）。

DELETE FROM app.product_process_route_version_steps s
USING app.product_process_route_versions v,
      app.product_process_routes r,
      app.process_step_catalog c
WHERE s.route_version_id = v.id
  AND v.route_id = r.id
  AND r.kind = 'MANUFACTURING'
  AND c.id = s.process_step_id
  AND c.category = 'MATERIAL_PREP';

-- 残った工程の並びを 0 から詰め直す（sort_order は並びの意味しか持たない）。
WITH ranked AS (
  SELECT s.id,
         row_number() OVER (PARTITION BY s.route_version_id ORDER BY s.sort_order) - 1 AS rn
  FROM app.product_process_route_version_steps s
  JOIN app.product_process_route_versions v ON v.id = s.route_version_id
  JOIN app.product_process_routes r ON r.id = v.route_id
  WHERE r.kind = 'MANUFACTURING'
)
UPDATE app.product_process_route_version_steps s
SET sort_order = ranked.rn
FROM ranked
WHERE s.id = ranked.id
  AND s.sort_order <> ranked.rn;
