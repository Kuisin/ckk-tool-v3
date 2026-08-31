-- rbac-seed.sql — RBAC 初期データ（監査 P0-1 の enforcement 前提データ）。
-- 冪等（ON CONFLICT）。適用:
--   cd shared-db && pnpm remote sh -c 'psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f sql/rbac-seed.sql'
--
-- 設計:
--   permissions = app-list.ts の requiredPermission 全コード + system
--   roles: admin(全コード ADMIN + system ADMIN) / staff(業務コードの実務アクション)
--   demo1 → admin、demo2〜5 → staff

BEGIN;

-- ─── permissions ─────────────────────────────────────────────────────────────
INSERT INTO app.permissions (code, display_name, description) VALUES
  ('price_list',      '{"ja":"価格表","en":"Price list"}',            '{"ja":"","en":""}'),
  ('quote',           '{"ja":"見積書","en":"Quote"}',                 '{"ja":"","en":""}'),
  ('order_acceptance','{"ja":"注文請書・注文明細","en":"Order acceptance"}', '{"ja":"","en":""}'),
  ('design_request',  '{"ja":"設計依頼","en":"Design request"}',      '{"ja":"依頼の起票・承認・進捗。図面そのものは design_file","en":""}'),
  ('design_file',     '{"ja":"設計図","en":"Drawing"}',
   '{"ja":"図面の版の登録・メモ編集・削除（設計図 PD06）。設計依頼 (design_request) とは別コード","en":""}'),
  ('material_receipt','{"ja":"素材入荷","en":"Material receipt"}',    '{"ja":"","en":""}'),
  ('outsource_order', '{"ja":"外注依頼","en":"Outsource order"}',     '{"ja":"","en":""}'),
  ('purchase_order',  '{"ja":"素材発注・購買依頼","en":"Purchasing"}','{"ja":"","en":""}'),
  ('work_order',      '{"ja":"指示書","en":"Work order"}',        '{"ja":"","en":""}'),
  ('approve',         '{"ja":"承認管理","en":"Approvals"}',           '{"ja":"","en":""}'),
  ('inventory',       '{"ja":"在庫","en":"Inventory"}',               '{"ja":"","en":""}'),
  ('delivery_order',  '{"ja":"出荷書","en":"Delivery order"}',        '{"ja":"","en":""}'),
  ('delivery_note',   '{"ja":"納品書","en":"Delivery note"}',         '{"ja":"","en":""}'),
  ('invoice',         '{"ja":"請求書","en":"Invoice"}',               '{"ja":"","en":""}'),
  ('billing_closing', '{"ja":"締日処理","en":"Billing closing"}',     '{"ja":"","en":""}'),
  ('master',          '{"ja":"マスタ管理","en":"Master data"}',       '{"ja":"","en":""}'),
  ('system',          '{"ja":"システム管理","en":"System admin"}',    '{"ja":"アプリ設定・ファイル管理・操作履歴","en":""}'),
  ('kiosk',           '{"ja":"共有端末管理","en":"Shared device admin"}',     '{"ja":"QRカード・共有端末の管理","en":""}'),
  ('admin_manual',   '{"ja":"管理マニュアル","en":"Internal docs"}','{"ja":"端末セットアップ等の社内向け手順書（公開マニュアルとは別権限）","en":""}'),
  -- 一般カテゴリ（CM02/CM03）。migration 20260903090000 で足したが、この seed が
  -- 追随していなかった。新規 DB をこの seed だけで作るときに欠ける。
  ('form',           '{"ja":"フォーム","en":"Forms"}',
   '{"ja":"フォームの作成・編集と全回答の閲覧。誰が回答できるかはフォームごとの共有設定が決める","en":""}'),
  ('internal_page',  '{"ja":"社内文書","en":"Internal pages"}',
   '{"ja":"社内文書アプリの利用。CREATE = 新規文書の作成可否。個々の文書の可視性は文書ごとの共有設定が決める","en":""}'),
  -- 特権操作（migration 20260919090000）。粗い kiosk / system を割ったもので、
  -- 実行には申請と承認が要る（詳細は shared-db/prisma/schema/security.prisma）。
  ('kiosk_secret',   '{"ja":"共有端末の秘密","en":"Shared device secrets"}',
   '{"ja":"メンテナンス退出 PIN・端末設定コードの開示と再生成、端末鍵のリセット","en":""}'),
  ('kiosk_device',   '{"ja":"端末アクセスの付与","en":"Shared device enrolment"}',
   '{"ja":"端末プロファイルの作成・リンク・有効化・停止・失効","en":""}'),
  ('kiosk_card',     '{"ja":"QRカードの発行・PIN","en":"Shared device card issuance"}',
   '{"ja":"カードの発行・割当・失効・PIN リセット・台紙の印刷","en":""}'),
  ('personal_data',  '{"ja":"個人データの閲覧","en":"Personal data access"}',
   '{"ja":"ログイン履歴の詳細と操作履歴の横断検索","en":""}'),
  ('user_admin',     '{"ja":"ユーザー・権限の変更","en":"User administration"}',
   '{"ja":"利用停止・復帰・所属拠点の変更。1 操作ごとに変更依頼を出し、承認が適用する","en":""}')
ON CONFLICT (code) DO NOTHING;

-- ─── roles ───────────────────────────────────────────────────────────────────
INSERT INTO app.roles (is_system, rolename, display_name, description) VALUES
  (true,  'admin', '{"ja":"管理者","en":"Administrator"}', '{"ja":"全権限","en":""}'),
  (true,  'staff', '{"ja":"一般","en":"Staff"}',           '{"ja":"業務全般（システム管理を除く）","en":""}')
ON CONFLICT DO NOTHING;

-- rolename に unique が無い環境でも重複しないよう存在チェックで補完
-- （初回 INSERT が入っていれば no-op）

-- ─── role_permission_relation ───────────────────────────────────────────────
-- admin: 全コード ADMIN（ADMIN は checkPermission 側で全アクションを内包）
INSERT INTO app.role_permission_relation (role_id, permission_code, action, scope)
SELECT r.id, p.code, 'ADMIN'::app."ACTION", 'ALL'::app."SCOPE"
FROM app.roles r CROSS JOIN app.permissions p
WHERE r.rolename = 'admin'
ON CONFLICT DO NOTHING;

-- **書類の**承認は権限アクションでは管理しない — APPROVE グラントは全ロールから
-- 全廃。承認できる人は承認設定（MS0B）の承認グループ所属だけが決め、RBAC 側の
-- 要件はその書類の READ / UPDATE（lib/authz.ts checkApprovalDocAccess）。
--
-- **例外は特権操作の 5 コードだけ**（migration 20260919090000）。あれは書類では
-- ないので MS0B に段を組めず、承認者を表現する場所が RBAC しかない。ここで
-- まとめて消すと privileged_approver が空のロールになり、申請が誰にも決裁でき
-- なくなる（この seed を後から流し直したときに沈黙で壊れる形）。
DELETE FROM app.role_permission_relation
 WHERE action = 'APPROVE'
   AND permission_code NOT IN
       ('kiosk_secret', 'kiosk_device', 'kiosk_card', 'personal_data', 'user_admin');

-- staff: system / kiosk 以外の業務コードに実務アクション
INSERT INTO app.role_permission_relation (role_id, permission_code, action, scope)
SELECT r.id, p.code, a.action::app."ACTION", 'ALL'::app."SCOPE"
FROM app.roles r
CROSS JOIN app.permissions p
CROSS JOIN (VALUES ('READ'),('CREATE'),('UPDATE'),('DELETE'),('EXPORT')) AS a(action)
-- 特権操作の 5 コードは staff にも配らない（system / kiosk と同じ扱い）。
-- 配ると「申請すれば誰でも PIN を見られる」になり、粒度を割った意味が消える。
WHERE r.rolename = 'staff'
  AND p.code NOT IN ('system', 'kiosk', 'admin_manual',
                     'kiosk_secret', 'kiosk_device', 'kiosk_card',
                     'personal_data', 'user_admin')
ON CONFLICT DO NOTHING;

-- ─── demo ユーザーへのロール割当 ─────────────────────────────────────────────
INSERT INTO app.user_role_relation (user_id, role_id, is_active, assigned_at)
SELECT u.id, r.id, true, now()
FROM app.users u JOIN app.roles r ON r.rolename = 'admin'
WHERE u.username = 'demo1'
ON CONFLICT (user_id, role_id) DO UPDATE SET is_active = true, deactivate_at = NULL;

INSERT INTO app.user_role_relation (user_id, role_id, is_active, assigned_at)
SELECT u.id, r.id, true, now()
FROM app.users u JOIN app.roles r ON r.rolename = 'staff'
WHERE u.username IN ('demo2','demo3','demo4','demo5')
ON CONFLICT (user_id, role_id) DO UPDATE SET is_active = true, deactivate_at = NULL;

COMMIT;
