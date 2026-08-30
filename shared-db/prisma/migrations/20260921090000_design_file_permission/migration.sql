-- 設計図 (PD06) の権限コード design_file。
--
-- これまで design_files（図面の版）に触る操作はすべて design_request 権限で
-- 守られていた。設計依頼 (SA06) と図面そのものは別の関心事で、
--   - 製造は図面を登録・更新するが、依頼を起票するわけではない
--   - 営業は依頼を出すが、図面の版を消してよいわけではない
-- という配り分けが 1 コードではできなかった。ここで割る。
--
-- スキーマ変更は無い（データのみ）。0008 の権限グラントは
-- `CROSS JOIN app.permissions` で書かれているが、0008 は既存 DB では適用済みなので
-- 新しいコードは配られない。よってここで明示的に配る（新規 DB でも同じ結果になる）。
--
-- 承認 (APPROVE) のグラントは作らない — 図面に承認フローは無い。

-- ─── 1. 新しい権限コード ─────────────────────────────────────────────────────
INSERT INTO app.permissions (code, display_name, description) VALUES
  ('design_file', '{"ja":"設計図","en":"Drawing"}',
   '{"ja":"図面の版の登録・メモ編集・削除。設計依頼 (design_request) は依頼の起票と承認だけを持つ","en":""}')
ON CONFLICT (code) DO UPDATE
  SET display_name = EXCLUDED.display_name,
      description  = EXCLUDED.description;

-- ─── 2. admin: 全コード ADMIN（0008 と同じ扱い）───────────────────────────────
INSERT INTO app.role_permission_relation (role_id, permission_code, action, scope)
SELECT r.id, 'design_file', 'ADMIN'::app."ACTION", 'ALL'::app."SCOPE"
FROM app.roles r
WHERE r.rolename = 'admin'
ON CONFLICT DO NOTHING;

-- ─── 3. staff: 業務コードなので実務アクション一式 ─────────────────────────────
INSERT INTO app.role_permission_relation (role_id, permission_code, action, scope)
SELECT r.id, 'design_file', a.action::app."ACTION", 'ALL'::app."SCOPE"
FROM app.roles r
CROSS JOIN (VALUES ('READ'),('CREATE'),('UPDATE'),('DELETE'),('EXPORT')) AS a(action)
WHERE r.rolename = 'staff'
ON CONFLICT DO NOTHING;

-- ─── 4. 業務ロール全部: READ ─────────────────────────────────────────────────
-- 図面は「何を作るか」なので、関わる全員が見られる必要がある（指示書・出荷・
-- 検査のどこからでもサムネイルとビューアが開く）。
INSERT INTO app.role_permission_relation (role_id, permission_code, action, scope)
SELECT r.id, 'design_file', 'READ'::app."ACTION", 'ALL'::app."SCOPE"
FROM app.roles r
WHERE r.rolename IN (
  'manager','sales','purchasing','production','quality','shipping',
  'accounting','viewer','sales_assistant','sales_manager',
  'purchasing_manager','production_manager','quality_manager',
  'shipping_manager','accounting_manager'
)
ON CONFLICT DO NOTHING;

-- ─── 5. 図面を作る側: CREATE・UPDATE ─────────────────────────────────────────
-- 図面を描くのは製造だけ。manager は roles-seed のとおり全コード R+E のみで、
-- ここでも作る側には入れない（seed と食い違うと、新規 DB と移行済み DB で
-- 権限が変わる）。
INSERT INTO app.role_permission_relation (role_id, permission_code, action, scope)
SELECT r.id, 'design_file', a.action::app."ACTION", 'ALL'::app."SCOPE"
FROM app.roles r
CROSS JOIN (VALUES ('CREATE'),('UPDATE')) AS a(action)
WHERE r.rolename IN ('production','production_manager')
ON CONFLICT DO NOTHING;

-- DELETE は配らない（admin / staff のみ）。版は履歴なので、消せるのは
-- 「指示書に使われていない手動登録の版」だけ（lib/design-files-core
-- canDeleteDesignFile）だが、それでも既定では消させない。

-- ─── 6. manager の EXPORT ────────────────────────────────────────────────────
-- 0008 の manager は「system/kiosk 以外の全コードに R+E」を CROSS JOIN で
-- 配っている。新コードは届かないので EXPORT だけ個別に足す（READ は 4 で配布済み）。
INSERT INTO app.role_permission_relation (role_id, permission_code, action, scope)
SELECT r.id, 'design_file', 'EXPORT'::app."ACTION", 'ALL'::app."SCOPE"
FROM app.roles r
WHERE r.rolename = 'manager'
ON CONFLICT DO NOTHING;
