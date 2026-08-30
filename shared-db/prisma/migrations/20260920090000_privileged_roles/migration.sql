-- 特権操作を実際に配れるようにするロール。
--
-- 20260919090000 で権限コードは作ったが、持てるロールは「全部入り」の
-- privileged_operator / privileged_approver の 2 つだけだった。それだと
-- 「端末の面倒だけ見てほしい人」に個人データの申請権限まで渡すことになる。
-- 役目ごとに分けて、必要なぶんだけ配れるようにする。
--
-- ■ 申請と承認は必ず別のロールにする
-- 同じロールに申請側と承認側を入れると、1 人に両方を割り当てたときに
-- 自分の申請を自分で承認できる……ように見える（実際はアプリが弾く）。
-- 「見た目にも分かれている」ことが運用の説明を楽にするので、ロールの段階で割る。
--
-- ■ 業務ロール（manager / *_manager / viewer）には配らない
-- 管理職に一律で承認権を与えれば楽だが、それは「PIN を見せてよいと判断できる人」
-- と「部門の業務を承認する人」を同一視することになる。承認者は明示的に
-- 承認ロールを割り当てて決める。roles-seed.sql の一括付与から特権 5 コードを
-- 除外してあるのも同じ理由。

-- ─── ロール ────────────────────────────────────────────────────────────────
INSERT INTO app.roles (is_system, rolename, display_name, description) VALUES
  (true, 'kiosk_operator', '{"ja":"端末運用（申請）","en":"Kiosk operator"}',
   '{"ja":"共有端末とQRカードの面倒を見る。PIN の開示・端末の登録・カードの発行は申請して承認を受ける","en":""}'),
  (true, 'kiosk_approver', '{"ja":"端末運用（承認）","en":"Kiosk approver"}',
   '{"ja":"端末とカードの特権操作を承認する。**自分では実行できない**","en":""}'),
  (true, 'user_operator', '{"ja":"ユーザー運用（申請）","en":"User operator"}',
   '{"ja":"入退社に伴うアカウント運用。利用停止・復帰・所属拠点の変更は変更依頼を出して承認を受ける","en":""}'),
  (true, 'user_approver', '{"ja":"ユーザー運用（承認）","en":"User approver"}',
   '{"ja":"ユーザーの変更依頼と個人データ閲覧を承認する。**自分では実行できない**","en":""}'),
  (true, 'security_auditor', '{"ja":"監査（履歴閲覧）","en":"Security auditor"}',
   '{"ja":"ログイン履歴・操作履歴を調べる。詳細と横断検索は申請して承認を受ける","en":""}')
ON CONFLICT (rolename) DO UPDATE
  SET display_name = EXCLUDED.display_name,
      description  = EXCLUDED.description;

-- 本ファイルが持つ 5 ロールは毎回作り直す（roles-seed.sql と同じ理由 —
-- ON CONFLICT DO NOTHING のままだと scope の変更が既存行に反映されない）。
DELETE FROM app.role_permission_relation
WHERE role_id IN (
  SELECT id FROM app.roles WHERE rolename IN (
    'kiosk_operator','kiosk_approver','user_operator','user_approver','security_auditor'
  )
);

-- ─── 端末運用（申請）──────────────────────────────────────────────────────
-- SY09 端末管理 / SY0A キオスク設定 の入口は kiosk、SY08 QRカード管理の入口は
-- kiosk_card。入口が無いと申請する画面にすら入れないので READ を配る。
INSERT INTO app.role_permission_relation (role_id, permission_code, action, scope)
SELECT r.id, g.code, g.action::app."ACTION", 'ALL'::app."SCOPE"
FROM app.roles r
CROSS JOIN (VALUES
  ('kiosk',        'READ'),
  ('kiosk',        'UPDATE'),   -- 端末の名称・設置場所（秘密には触れない）
  ('kiosk_secret', 'READ'),
  ('kiosk_secret', 'UPDATE'),
  ('kiosk_device', 'READ'),
  ('kiosk_device', 'CREATE'),
  ('kiosk_device', 'UPDATE'),
  ('kiosk_card',   'READ'),
  ('kiosk_card',   'CREATE'),
  ('kiosk_card',   'UPDATE')
) AS g(code, action)
WHERE r.rolename = 'kiosk_operator';

-- ─── 端末運用（承認）──────────────────────────────────────────────────────
-- APPROVE だけ。申請側は配らない。
INSERT INTO app.role_permission_relation (role_id, permission_code, action, scope)
SELECT r.id, c.code, 'APPROVE'::app."ACTION", 'ALL'::app."SCOPE"
FROM app.roles r
CROSS JOIN (VALUES ('kiosk_secret'),('kiosk_device'),('kiosk_card')) AS c(code)
WHERE r.rolename = 'kiosk_approver';

-- ─── ユーザー運用（申請）──────────────────────────────────────────────────
INSERT INTO app.role_permission_relation (role_id, permission_code, action, scope)
SELECT r.id, g.code, g.action::app."ACTION", 'ALL'::app."SCOPE"
FROM app.roles r
CROSS JOIN (VALUES
  ('user_admin', 'READ'),      -- SY01 の入口（これが無いと変更依頼を出せない）
  ('user_admin', 'UPDATE')
) AS g(code, action)
WHERE r.rolename = 'user_operator';

-- ─── ユーザー運用（承認）──────────────────────────────────────────────────
-- 人に関わる決裁をまとめる: アカウントの変更依頼と、個人データ閲覧の申請。
INSERT INTO app.role_permission_relation (role_id, permission_code, action, scope)
SELECT r.id, c.code, 'APPROVE'::app."ACTION", 'ALL'::app."SCOPE"
FROM app.roles r
CROSS JOIN (VALUES ('user_admin'),('personal_data')) AS c(code)
WHERE r.rolename = 'user_approver';

-- ─── 監査（履歴閲覧）──────────────────────────────────────────────────────
-- 一覧は素の権限で見え、詳細（IP・端末シグネチャ）と横断検索は承認が要る。
INSERT INTO app.role_permission_relation (role_id, permission_code, action, scope)
SELECT r.id, 'personal_data', 'READ'::app."ACTION", 'ALL'::app."SCOPE"
FROM app.roles r
WHERE r.rolename = 'security_auditor';

-- ─── 既存の「全部入り」2 ロールを整える ───────────────────────────────────
-- 小さな組織では役目を分けきれないので、全ドメインを 1 つで持てる版も残す。
-- 20260919090000 で作ったグラントに user_admin:READ が抜けていた（SY01 の入口が
-- READ なので、変更依頼を出す画面に入れなかった）。作り直して揃える。
DELETE FROM app.role_permission_relation
WHERE role_id IN (
  SELECT id FROM app.roles WHERE rolename IN ('privileged_operator','privileged_approver')
);

INSERT INTO app.role_permission_relation (role_id, permission_code, action, scope)
SELECT r.id, g.code, g.action::app."ACTION", 'ALL'::app."SCOPE"
FROM app.roles r
CROSS JOIN (VALUES
  ('kiosk',         'READ'),
  ('kiosk_secret',  'READ'),
  ('kiosk_secret',  'UPDATE'),
  ('kiosk_device',  'READ'),
  ('kiosk_device',  'CREATE'),
  ('kiosk_device',  'UPDATE'),
  ('kiosk_card',    'READ'),
  ('kiosk_card',    'CREATE'),
  ('kiosk_card',    'UPDATE'),
  ('personal_data', 'READ'),
  ('user_admin',    'READ'),
  ('user_admin',    'UPDATE')
) AS g(code, action)
WHERE r.rolename = 'privileged_operator';

INSERT INTO app.role_permission_relation (role_id, permission_code, action, scope)
SELECT r.id, c.code, 'APPROVE'::app."ACTION", 'ALL'::app."SCOPE"
FROM app.roles r
CROSS JOIN (VALUES
  ('kiosk_secret'),('kiosk_device'),('kiosk_card'),('personal_data'),('user_admin')
) AS c(code)
WHERE r.rolename = 'privileged_approver';
