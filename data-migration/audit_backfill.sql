-- audit_backfill.sql — 現行マスタに対する監査ログ（SEED, actor=システム）の生成。
--
-- レガシー一括インポート（010–030）で投入された現行データ（取引先 / 材種 / 素材 /
-- 製品）を、生きているテーブルから直接読み、各レコードに 1 件の SEED 監査行を作る。
-- これにより詳細画面「履歴」タブ（record 単位）と管理者「操作履歴」一覧が、
-- デモ値ではなく実際に存在するデータを反映する。
--
-- record_id は各詳細画面が fetchAuditEntries に渡すキーに一致させる:
--   business_partners → id（uuid 文字列）
--   material_types / materials / products → 内部 id を十進文字列化（id::text）
-- actor は固定システムユーザー（00000000-…-0000, migration 20260706040000）。
-- created_at はレコードの created_at に合わせ、タイムラインを実データに沿わせる。
--
-- 冪等: 各 INSERT は (table_name, record_id, action='SEED') が無い場合のみ挿入。
-- import:legacy が 010–030 の後（999）に適用するため、SELECT は投入済みデータを見る。

BEGIN;

-- actor（システムユーザー）を保証。migration と同一 UUID。
INSERT INTO app.users (id, "group", username, display_name, is_active, created_at, updated_at)
VALUES ('00000000-0000-0000-0000-000000000000', 'SYSTEM', 'system', 'システム', true, now(), now())
ON CONFLICT (id) DO NOTHING;

-- 取引先（business_partners）
INSERT INTO app.audit_logs (user_id, action, table_name, record_id, after_data, created_at)
SELECT '00000000-0000-0000-0000-000000000000', 'SEED', 'business_partners', bp.id::text,
       jsonb_build_object('note', 'レガシー移行により登録', 'code', bp.bp_code, 'name', bp.name),
       bp.created_at
FROM app.business_partners bp
WHERE NOT EXISTS (
  SELECT 1 FROM app.audit_logs a
  WHERE a.table_name = 'business_partners' AND a.record_id = bp.id::text AND a.action = 'SEED'
);

-- 材種（material_types）
INSERT INTO app.audit_logs (user_id, action, table_name, record_id, after_data, created_at)
SELECT '00000000-0000-0000-0000-000000000000', 'SEED', 'material_types', mt.id::text,
       jsonb_build_object('note', 'レガシー移行により登録', 'code', mt.code, 'name', mt.name),
       mt.created_at
FROM app.material_types mt
WHERE NOT EXISTS (
  SELECT 1 FROM app.audit_logs a
  WHERE a.table_name = 'material_types' AND a.record_id = mt.id::text AND a.action = 'SEED'
);

-- 素材（materials）
INSERT INTO app.audit_logs (user_id, action, table_name, record_id, after_data, created_at)
SELECT '00000000-0000-0000-0000-000000000000', 'SEED', 'materials', m.id::text,
       jsonb_build_object('note', 'レガシー移行により登録', 'code', m.code, 'name', m.name),
       m.created_at
FROM app.materials m
WHERE NOT EXISTS (
  SELECT 1 FROM app.audit_logs a
  WHERE a.table_name = 'materials' AND a.record_id = m.id::text AND a.action = 'SEED'
);

-- 製品（products）
INSERT INTO app.audit_logs (user_id, action, table_name, record_id, after_data, created_at)
SELECT '00000000-0000-0000-0000-000000000000', 'SEED', 'products', p.id::text,
       jsonb_build_object('note', 'レガシー移行により登録', 'name', p.name),
       p.created_at
FROM app.products p
WHERE NOT EXISTS (
  SELECT 1 FROM app.audit_logs a
  WHERE a.table_name = 'products' AND a.record_id = p.id::text AND a.action = 'SEED'
);

-- 価格表エントリ（price_list_entries）
-- record_id は詳細画面が使う価格表番号 PRC-YYYYMM-NNNNN（lib/doc-number の
-- formatPriceListNumber = 'PRC-'||year_month||'-'||lpad(seq,5) と一致させる）。
-- PR #70 で (year_month, seq) 複合キーへ再キーされ、旧デモ監査行の record_id
-- （customer__product__order_type）とはもう一致しないため、ここで補完する。
INSERT INTO app.audit_logs (user_id, action, table_name, record_id, after_data, created_at)
SELECT '00000000-0000-0000-0000-000000000000', 'SEED', 'price_list_entries',
       'PRC-' || e.year_month || '-' || lpad(e.seq::text, 5, '0'),
       jsonb_build_object('note', '初期データとして登録', 'base_unit_price', e.base_unit_price),
       e.created_at
FROM app.price_list_entries e
WHERE NOT EXISTS (
  SELECT 1 FROM app.audit_logs a
  WHERE a.table_name = 'price_list_entries'
    AND a.record_id = 'PRC-' || e.year_month || '-' || lpad(e.seq::text, 5, '0')
    AND a.action = 'SEED'
);

-- サマリのシステムイベント（操作履歴一覧の区切り・件数記録）
INSERT INTO app.audit_logs (user_id, action, table_name, record_id, after_data)
SELECT '00000000-0000-0000-0000-000000000000', 'SEED', 'system', 'legacy-import',
       jsonb_build_object(
         'note', 'レガシー一括インポート（取引先・材種・素材・製品）',
         'business_partners', (SELECT count(*) FROM app.business_partners),
         'material_types',    (SELECT count(*) FROM app.material_types),
         'materials',         (SELECT count(*) FROM app.materials),
         'products',          (SELECT count(*) FROM app.products)
       )
WHERE NOT EXISTS (
  SELECT 1 FROM app.audit_logs a WHERE a.table_name = 'system' AND a.record_id = 'legacy-import'
);

COMMIT;
