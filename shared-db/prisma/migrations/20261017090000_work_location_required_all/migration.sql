-- 全工程で作業計画に 計画日 + 作業場所 を要る側へ揃える（一度だけ）。
--
-- 20261016 で〇〇出し・受渡しだけ work_location_required を false に倒したが、
-- 「既定は全工程で日付と作業場所が要る」に決まった（在庫の移動も、どの棚・どの
-- エリアで行うかを計画に残す）。要らない工程があれば MS08 で個別に外す — 既定を
-- 緩めるのではなく、例外を管理者が選ぶ向きにする。列の DEFAULT は元から true。
UPDATE "app"."process_step_catalog"
SET "work_location_required" = true
WHERE "work_location_required" = false;
