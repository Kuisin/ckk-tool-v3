-- 一般カテゴリの新アプリ 2 種 (CM02 フォーム / CM03 社内文書) の権限コードと、
-- DC02 の改名 (社内ドキュメント → 管理マニュアル) に伴う権限コード・
-- フィーチャーフラグキーの付け替え。
--
-- スキーマ変更は無い（データのみ）。0008 の権限グラントは
-- `CROSS JOIN app.permissions` で書かれているが、0008 は既存 DB では適用済みなので
-- 新しいコードは配られない。よってここで明示的に配る（新規 DB でも同じ結果になる）。
--
-- 承認 (APPROVE) のグラントは作らない — 0008 のとおり、承認できる人は
-- 承認設定 (MS0B) の承認グループ所属だけが決める。

-- ─── 1. DC02 改名: internal_docs → admin_manual ──────────────────────────────
-- 「社内ドキュメント」(DC02, 開発者が書く管理者向け手順書) は、一般カテゴリに
-- 新設する「社内文書」(CM03, 利用者が書く文書) と紛らわしい。DC02 を
-- 「管理マニュアル」へ改名し、URL も /internal-docs → /admin-manual へ移した。
-- app-list.ts の key もフィーチャーフラグのキーなので合わせて付け替える。
INSERT INTO app.permissions (code, display_name, description) VALUES
  ('admin_manual', '{"ja":"管理マニュアル","en":"Admin manual"}',
   '{"ja":"端末セットアップ等の管理者向け手順書（公開マニュアルとは別権限）","en":""}')
ON CONFLICT (code) DO UPDATE
  SET display_name = EXCLUDED.display_name,
      description  = EXCLUDED.description;

-- 旧コードのグラントを新コードへ写す（存在する場合のみ）。
INSERT INTO app.role_permission_relation (role_id, permission_code, action, scope, scope_values)
SELECT role_id, 'admin_manual', action, scope, scope_values
FROM app.role_permission_relation
WHERE permission_code = 'internal_docs'
ON CONFLICT DO NOTHING;

DELETE FROM app.role_permission_relation WHERE permission_code = 'internal_docs';
DELETE FROM app.permissions WHERE code = 'internal_docs';

-- フィーチャーフラグのキーも付け替える（app-list.ts の key = フラグキー）。
-- 直さないと main で管理マニュアルが消える。
UPDATE app.feature_flags
   SET key = 'app:admin-manual:main',
       description = '管理マニュアル 本番公開（閲覧は admin_manual 権限）',
       updated_at = now()
 WHERE key = 'app:internal-docs:main'
   AND NOT EXISTS (SELECT 1 FROM app.feature_flags WHERE key = 'app:admin-manual:main');
DELETE FROM app.feature_flags WHERE key = 'app:internal-docs:main';

-- ─── 2. 新しい権限コード ─────────────────────────────────────────────────────
INSERT INTO app.permissions (code, display_name, description) VALUES
  ('form',          '{"ja":"フォーム","en":"Forms"}',
   '{"ja":"フォームの作成・編集と全回答の閲覧。誰が回答できるかはフォームごとの共有設定が決める","en":""}'),
  ('internal_page', '{"ja":"社内文書","en":"Internal pages"}',
   '{"ja":"社内文書アプリの利用。CREATE = 新規文書の作成可否。個々の文書の可視性は文書ごとの共有設定が決める","en":""}')
ON CONFLICT (code) DO UPDATE
  SET display_name = EXCLUDED.display_name,
      description  = EXCLUDED.description;

-- admin: 全コード ADMIN（0008 と同じ扱い）
INSERT INTO app.role_permission_relation (role_id, permission_code, action, scope)
SELECT r.id, c.code, 'ADMIN'::app."ACTION", 'ALL'::app."SCOPE"
FROM app.roles r
CROSS JOIN (VALUES ('form'),('internal_page'),('admin_manual')) AS c(code)
WHERE r.rolename = 'admin'
ON CONFLICT DO NOTHING;

-- staff: 管理専用コード (system / kiosk / admin_manual) 以外なので実務アクション一式
INSERT INTO app.role_permission_relation (role_id, permission_code, action, scope)
SELECT r.id, c.code, a.action::app."ACTION", 'ALL'::app."SCOPE"
FROM app.roles r
CROSS JOIN (VALUES ('form'),('internal_page')) AS c(code)
CROSS JOIN (VALUES ('READ'),('CREATE'),('UPDATE'),('DELETE'),('EXPORT')) AS a(action)
WHERE r.rolename = 'staff'
ON CONFLICT DO NOTHING;

-- 業務ロール全部: READ（誰でもフォームに答え、社内文書を読む）
INSERT INTO app.role_permission_relation (role_id, permission_code, action, scope)
SELECT r.id, c.code, 'READ'::app."ACTION", 'ALL'::app."SCOPE"
FROM app.roles r
CROSS JOIN (VALUES ('form'),('internal_page')) AS c(code)
WHERE r.rolename IN (
  'manager','sales','purchasing','production','quality','shipping',
  'accounting','viewer','sales_assistant','sales_manager',
  'purchasing_manager','production_manager','quality_manager',
  'shipping_manager','accounting_manager'
)
ON CONFLICT DO NOTHING;

-- manager / 各部長: 作る側にも回るので CREATE・UPDATE（フォームは DELETE も）
INSERT INTO app.role_permission_relation (role_id, permission_code, action, scope)
SELECT r.id, c.code, a.action::app."ACTION", 'ALL'::app."SCOPE"
FROM app.roles r
CROSS JOIN (VALUES ('form'),('internal_page')) AS c(code)
CROSS JOIN (VALUES ('CREATE'),('UPDATE')) AS a(action)
WHERE r.rolename IN (
  'manager','sales_manager','purchasing_manager','production_manager',
  'quality_manager','shipping_manager','accounting_manager'
)
ON CONFLICT DO NOTHING;

INSERT INTO app.role_permission_relation (role_id, permission_code, action, scope)
SELECT r.id, 'form', 'DELETE'::app."ACTION", 'ALL'::app."SCOPE"
FROM app.roles r
WHERE r.rolename IN (
  'manager','sales_manager','purchasing_manager','production_manager',
  'quality_manager','shipping_manager','accounting_manager'
)
ON CONFLICT DO NOTHING;

-- manager / viewer は 0008 で「system/kiosk 以外の全コードに R(+E)」を配っている。
-- 新コードは上で個別に配ったので、EXPORT だけ manager に足しておく。
INSERT INTO app.role_permission_relation (role_id, permission_code, action, scope)
SELECT r.id, c.code, 'EXPORT'::app."ACTION", 'ALL'::app."SCOPE"
FROM app.roles r
CROSS JOIN (VALUES ('form'),('internal_page')) AS c(code)
WHERE r.rolename = 'manager'
ON CONFLICT DO NOTHING;
