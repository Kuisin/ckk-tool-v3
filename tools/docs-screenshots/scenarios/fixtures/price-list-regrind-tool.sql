-- price-list-regrind-tool — 再研磨の価格表の「対象工具」（#975）の準備。
--
-- 研ぎ直す工具は**他社製品**（items.is_external_product）で、デモシードには 1 つも無い。
-- 2 つ足す — 片方にだけ工具専用の価格表を作り、もう片方が「工具を問わない価格表」へ
-- 落ちることを見るため。売る役務（再研磨品目）はシードの 9204
-- 「再研磨 超硬エンドミル 外周 4枚刃 φ10超20以下」（標準価格 ¥720）を使う。
-- 価格表そのものは画面から作る（それが確かめる対象）。
INSERT INTO app.items (id, item_type, code, year_month, seq, name,
  unit, is_active, is_external_product, maker_name, created_at, updated_at)
VALUES
  (9301, 'PRODUCT'::app."ITEM_TYPE", 'PRD-209903-0001', '209903', 1,
   '{"ja": "日研 超硬エンドミル 4枚刃 φ12×75", "en": "Nikken carbide end mill 4FL φ12×75"}'::jsonb,
   '本', true, true, '日研ツール', now(), now()),
  (9302, 'PRODUCT'::app."ITEM_TYPE", 'PRD-209903-0002', '209903', 2,
   '{"ja": "OSG 超硬エンドミル 4枚刃 φ16×90", "en": "OSG carbide end mill 4FL φ16×90"}'::jsonb,
   '本', true, true, 'OSG', now(), now());

SELECT setval(pg_get_serial_sequence('app.items', 'id'),
              GREATEST((SELECT MAX(id) FROM app.items), 9302));
