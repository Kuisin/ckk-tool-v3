-- 取引先ポータルの管理権限（portal_admin）と、その特権操作のロール割当。
--
-- なぜ migration なのか: 業務ロールへの配布は sql/roles-seed.sql（冪等・再実行可）が
-- CROSS JOIN で行うが、**特権ロール（privileged_operator / privileged_approver）への
-- 割当は migration が持っている**（20260920090000_privileged_roles）。そちらに
-- 合わせる。コードの追加自体も、既存 DB に後から入れる必要があるのでここで行う。
--
-- ■ 業務ロールには配らない
-- roles-seed.sql の 7 つの除外リストと rbac-seed.sql の staff 除外に portal_admin を
-- 足してある。除外し忘れると manager / viewer / 6 つの *_manager に
-- 「社外の個人データを読み、書類リンクを発行できる」権限が黙って配られる
-- （kiosk で一度起きた罠）。ここでも念のため、既に配られていれば剥がす。

INSERT INTO app.permissions (code, display_name, description) VALUES
  ('portal_admin',
   '{"ja":"取引先ポータルの管理","en":"Partner portal administration"}',
   '{"ja":"社外アカウントの作成・有効化・共有範囲、書類リンクの発行と失効","en":""}')
ON CONFLICT (code) DO NOTHING;

-- 業務ロールに紛れ込んでいたら剥がす（seed の除外を足す前に流れた場合の後始末）。
DELETE FROM app.role_permission_relation rpr
 USING app.roles r
 WHERE rpr.role_id = r.id
   AND rpr.permission_code = 'portal_admin'
   AND r.rolename IN ('manager','viewer','staff',
                      'sales_manager','purchasing_manager','production_manager',
                      'quality_manager','shipping_manager','accounting_manager');

-- 申請側: 一覧の閲覧と、アカウント・リンクの作成/更新。
-- 実際に「有効化」「バックアップコード発行」「LINK_ONLY 発行」ができるかは
-- lib/privileged-access.ts の昇格（SY0G の承認）が別途決める。
INSERT INTO app.role_permission_relation (role_id, permission_code, action, scope)
SELECT r.id, 'portal_admin', g.action::app."ACTION", 'ALL'::app."SCOPE"
FROM app.roles r
CROSS JOIN (VALUES ('READ'),('CREATE'),('UPDATE')) AS g(action)
WHERE r.rolename = 'privileged_operator'
ON CONFLICT DO NOTHING;

-- 決裁側: APPROVE のみ（申請側のグラントは一切与えない — 自己承認を作らない）。
INSERT INTO app.role_permission_relation (role_id, permission_code, action, scope)
SELECT r.id, 'portal_admin', 'APPROVE'::app."ACTION", 'ALL'::app."SCOPE"
FROM app.roles r
WHERE r.rolename = 'privileged_approver'
ON CONFLICT DO NOTHING;
