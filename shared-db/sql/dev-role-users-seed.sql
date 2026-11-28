-- dev-role-users-seed.sql — ロール別 dev 検証ユーザー（password: dev2026）。
-- 各ロールの権限境界を検証するためのユーザー。冪等。dev 専用 — 本番では
-- roles-seed.sql のロールを実ユーザーへ割り当てる。
-- 適用: cd shared-db && pnpm remote sh -c 'psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f sql/dev-role-users-seed.sql'

BEGIN;

WITH seed(username, display_name, password_hash) AS (
  VALUES
    ('dev_sales', '開発 営業', '4e4f22f09fa26c8ad33c7a4aedfb75d8:b276cfeea7eb56226a5c2ff8ae6eceeee09907ce57719dc38616be0f23aba693252c462c6ec5b4f0fe7432f6f58886a76f029983d5cac7b6642632182db0216b'),
    ('dev_purchasing', '開発 購買', '9eee337b81c0070dd006b04369721c06:00d889ab618ab334e290c5ec0c6361ed695224541f99e793a2bed2fc4f3f589ab60ea0a4feaf65185cae0460a82a733b73552b2ca666c8094999fc9ebe9cd826'),
    ('dev_production', '開発 製造', 'ffec413f64a83150db26877b1f49e2b9:fcc413126c6b4daee7162239b7418be80e72c0415610a1277e5191f4feb3071be4cd371b8d5403c0b3447330586c7a86670b5ce8621d700dbc3b10190103b695'),
    ('dev_quality', '開発 品質', '7d1ad6d59108c73ffa8f6021cdba1cb9:0525a0004f785b9abf76060ad9c73a2caaffb3cfc5b4588337f275d5eecf40040406d37c805de9786a772f5e1a1cd2c081b51d4d0afdb966eb3855dac26db852'),
    ('dev_shipping', '開発 出荷', '1c589c0a1da1022d8dc22e6d61d75356:01bb997d8e8b86837f454408e0da4b2ddc6eaeb6a73a4690909d332f017e54387a4c022ef0b76c03404fe457198a2b85d49a646d55bd8101e8aa2498a8be6b01'),
    ('dev_accounting', '開発 経理', 'e5c1fbc747f317d770552de3dd6f2050:5fdc5520f06ca362fc66f69066a84a6e63c8c5914a456d186b8ae6edda12cc8ef99e80d5be5549222ad3f337375416f7362cec1767e7cedd12e1a9493c9bc6f1'),
    ('dev_manager', '開発 管理職', '992f02429e9b1f90df4636e2c40ab697:9094e8bdf1e760148512faa1ff9c70faa88306b855357689c37a2bd91da2c15f54c921185f95c10ba7e48638118b8c66ffa4b6717ec1cee998c119c95adb74e0'),
    ('dev_viewer', '開発 閲覧', '030b1388acb2c756683b5cb1e43e001c:8ece5dfce964f1f38d68f65309566bcd254824ce8ddd390adc71e8c8e9ea365c417696129112ad206badfb0ed0a0507138ceed56e9c5f82008707e8de373de6a'),
    ('dev_sales_assistant', '開発 営業補佐', 'a8951d7539e6c8d3f044317b07d43d95:a7f7870be724b6d641d2b1bce124f879b850bf06e5e179439908e41f83437a65e8a8d3062f943673862b6bced70d685998b1dfa2ab62a14bcdad9d16420b3093'),
    ('dev_sales_mgr', '開発 営業部長', '5602e5837f018196cf878c3c6396c5f8:c7fcdd32656bc71c2dba82d4be176d6e1971ea4790b2bb088d2222083eb860271a3916152bc714cdcaf664ea3cbbc899378d90d07a886d6160c4c53c33021c0e'),
    ('dev_purchasing_mgr', '開発 購買部長', '84f5ccfc994f818ea2d88822d6de9663:d824eae9973a68ea4a71844a2749770c197b2605c21f3c99e356f19b44128bdad681978005e321d9dea320a5926a67568f414a0b26f2a42ee8b9a78fb2173df0'),
    ('dev_production_mgr', '開発 製造部長', '1fb36a5d84a6c6bf36f5ac738bb1f735:546528ea27b5a50ba86196204fd9b3a878cb0707ff3e74b964a21ffdd4bb5337d17ccbed9eb522267dadf6647d2100ef14f99ea300095dfbadf3d2cf89707820'),
    ('dev_quality_mgr', '開発 品質部長', 'c62367fda2c32601d3c12a3d3a87b80e:ef36ecad52592288399f691b01ebd83a8e63a9d9ce588a4871e75f9c54901ff86356335bef99dabfaeee20de82da7b0700615a4aa843cff0c3fa1986204a00ad'),
    ('dev_shipping_mgr', '開発 出荷部長', '705618129f03f4ed93b375d998ffdfe5:9a389d0710b04b5e781c825632c50816af995ff53032d720bac9d42f586b219ab8fa82455eb600c79ab306f8528d0926c0f55d010b73d7aed708f7d87a171965'),
    ('dev_accounting_mgr', '開発 経理部長', 'a59583f65c12fcc1c0eff6fc4622b7a2:ba5b3ea1485021f6793a8f3b2d3cb3a9713d491e121f45c5d3bfb6d77ca4289864d377bd71429fe384c8f6974109e3244d559dddf079c7999ba76abb100dfe49'),
    -- マスタ編集だけを持つ単機能ロールの検証用（業務書類は 1 つも見えないこと）。
    ('dev_master_editor', '開発 マスタ管理', '193c0b67eecc00f8ba945174bc5aeee5:0c4edec40c602061b730298b603602a594241a5e57054a0cd796f3a5e3bffb16b1f8b27e81f72233faed226e0766f18cb462f1d6fc11a7d5a5df21db3bd99d29'),
    -- 特権アクセス（SY0G）の検証用。**申請する人と承認する人を分けてある** —
    -- 1 人で両方を持たせると、分離が効いているかを確かめられない。
    ('dev_priv_operator', '開発 特権申請', 'f6ec0af0074acf77bfeed6f3d6c478a8:256755d0c3ba4f7470073912a501e922d4dff8ae36786244269f52061a028de0abfbbd4be76df2af212a95964c2335cb857f9d8de8400e3635c56c600bc479da'),
    ('dev_priv_approver', '開発 特権承認', '6524adc22e86d789d690b6ad8e18e67e:0abfd5bf56d2bf2d9bc848bcf8491cc7bbf3669b5d2fc3d25a8d616c40ff723a4848541daeb3f769d359131c84f724a63d01c4758797f3791e87240fb2947fff'),
    -- 役目を絞ったロールの検証用（端末運用 / ユーザー運用 / 監査）。
    ('dev_kiosk_op', '開発 端末運用申請', '387f2a7771125986fc8ae27798f9a43d:3726e553ce7b4b6e9294b86208f3c7bb62cedec7b39f575e7f90ee799e08f4fc41b948c9a72f1a14391220ec7dbee66a16ce30fb7c4dcb2236c87ff48def9849'),
    ('dev_kiosk_ap', '開発 端末運用承認', '50a53fcfa028bf009efad50ece77f787:cfbd8fd2d30d49ae03381d5e4027f718ec1f193b915bf6d97ecad7dc614b70614a27dd3044a890f9581a596b3d0dd9fb5453511638020adc88961d48e65c1d3d'),
    ('dev_user_op', '開発 ユーザー運用申請', 'f92dab733d29e84aeebe818f72817b5e:0b055fe41c87be35d944af6f89375901b59d6d96a1de2107923827e8df2def4086d179df51100f5d48dd7a9a863254ea53077acff15498d3225bc872667cd239'),
    ('dev_user_ap', '開発 ユーザー運用承認', '67c437d850576d2587ea0c504aeb7dbc:f78937a923c74a6f1d63bd4093bbc9665d33d1e5a4a4b56fdb4d91e5512b3f66ee78556a4a9178158fe386fc7cf5836eac433e19f2d2ee53c9969449da0f9bb2'),
    ('dev_auditor', '開発 監査', '04cd69e1e78c92361f97d0c6e8288a80:7f824a9f36f8f4f767e0a1c0f1ccf1c723c46369381bd23c9a7794cc50c68c5cbac990ac236b292294b106e134864ef47cffc75c6e9d03f26eaf1110cf73fc2d')
)
INSERT INTO app.users (id, "group", username, display_name, password_hash, is_active, created_at, updated_at)
SELECT gen_random_uuid(), 'EMPLOYEE'::app."USER_GROUP", s.username, s.display_name, s.password_hash, true, now(), now()
FROM seed s
ON CONFLICT (username) DO UPDATE SET password_hash = EXCLUDED.password_hash, is_active = true;

INSERT INTO app.user_role_relation (user_id, role_id, is_active, assigned_at)
SELECT u.id, r.id, true, now() FROM app.users u JOIN app.roles r ON r.rolename = 'sales'
WHERE u.username = 'dev_sales'
ON CONFLICT (user_id, role_id) DO UPDATE SET is_active = true, deactivate_at = NULL;

INSERT INTO app.user_role_relation (user_id, role_id, is_active, assigned_at)
SELECT u.id, r.id, true, now() FROM app.users u JOIN app.roles r ON r.rolename = 'purchasing'
WHERE u.username = 'dev_purchasing'
ON CONFLICT (user_id, role_id) DO UPDATE SET is_active = true, deactivate_at = NULL;

INSERT INTO app.user_role_relation (user_id, role_id, is_active, assigned_at)
SELECT u.id, r.id, true, now() FROM app.users u JOIN app.roles r ON r.rolename = 'production'
WHERE u.username = 'dev_production'
ON CONFLICT (user_id, role_id) DO UPDATE SET is_active = true, deactivate_at = NULL;

INSERT INTO app.user_role_relation (user_id, role_id, is_active, assigned_at)
SELECT u.id, r.id, true, now() FROM app.users u JOIN app.roles r ON r.rolename = 'quality'
WHERE u.username = 'dev_quality'
ON CONFLICT (user_id, role_id) DO UPDATE SET is_active = true, deactivate_at = NULL;

INSERT INTO app.user_role_relation (user_id, role_id, is_active, assigned_at)
SELECT u.id, r.id, true, now() FROM app.users u JOIN app.roles r ON r.rolename = 'shipping'
WHERE u.username = 'dev_shipping'
ON CONFLICT (user_id, role_id) DO UPDATE SET is_active = true, deactivate_at = NULL;

INSERT INTO app.user_role_relation (user_id, role_id, is_active, assigned_at)
SELECT u.id, r.id, true, now() FROM app.users u JOIN app.roles r ON r.rolename = 'accounting'
WHERE u.username = 'dev_accounting'
ON CONFLICT (user_id, role_id) DO UPDATE SET is_active = true, deactivate_at = NULL;

INSERT INTO app.user_role_relation (user_id, role_id, is_active, assigned_at)
SELECT u.id, r.id, true, now() FROM app.users u JOIN app.roles r ON r.rolename = 'manager'
WHERE u.username = 'dev_manager'
ON CONFLICT (user_id, role_id) DO UPDATE SET is_active = true, deactivate_at = NULL;

INSERT INTO app.user_role_relation (user_id, role_id, is_active, assigned_at)
SELECT u.id, r.id, true, now() FROM app.users u JOIN app.roles r ON r.rolename = 'viewer'
WHERE u.username = 'dev_viewer'
ON CONFLICT (user_id, role_id) DO UPDATE SET is_active = true, deactivate_at = NULL;

INSERT INTO app.user_role_relation (user_id, role_id, is_active, assigned_at)
SELECT u.id, r.id, true, now() FROM app.users u JOIN app.roles r ON r.rolename = 'sales_assistant'
WHERE u.username = 'dev_sales_assistant'
ON CONFLICT (user_id, role_id) DO UPDATE SET is_active = true, deactivate_at = NULL;

INSERT INTO app.user_role_relation (user_id, role_id, is_active, assigned_at)
SELECT u.id, r.id, true, now() FROM app.users u JOIN app.roles r ON r.rolename = 'master_editor'
WHERE u.username = 'dev_master_editor'
ON CONFLICT (user_id, role_id) DO UPDATE SET is_active = true, deactivate_at = NULL;

INSERT INTO app.user_role_relation (user_id, role_id, is_active, assigned_at)
SELECT u.id, r.id, true, now() FROM app.users u JOIN app.roles r ON r.rolename = 'sales_manager'
WHERE u.username = 'dev_sales_mgr'
ON CONFLICT (user_id, role_id) DO UPDATE SET is_active = true, deactivate_at = NULL;

INSERT INTO app.user_role_relation (user_id, role_id, is_active, assigned_at)
SELECT u.id, r.id, true, now() FROM app.users u JOIN app.roles r ON r.rolename = 'purchasing_manager'
WHERE u.username = 'dev_purchasing_mgr'
ON CONFLICT (user_id, role_id) DO UPDATE SET is_active = true, deactivate_at = NULL;

INSERT INTO app.user_role_relation (user_id, role_id, is_active, assigned_at)
SELECT u.id, r.id, true, now() FROM app.users u JOIN app.roles r ON r.rolename = 'production_manager'
WHERE u.username = 'dev_production_mgr'
ON CONFLICT (user_id, role_id) DO UPDATE SET is_active = true, deactivate_at = NULL;

INSERT INTO app.user_role_relation (user_id, role_id, is_active, assigned_at)
SELECT u.id, r.id, true, now() FROM app.users u JOIN app.roles r ON r.rolename = 'quality_manager'
WHERE u.username = 'dev_quality_mgr'
ON CONFLICT (user_id, role_id) DO UPDATE SET is_active = true, deactivate_at = NULL;

INSERT INTO app.user_role_relation (user_id, role_id, is_active, assigned_at)
SELECT u.id, r.id, true, now() FROM app.users u JOIN app.roles r ON r.rolename = 'shipping_manager'
WHERE u.username = 'dev_shipping_mgr'
ON CONFLICT (user_id, role_id) DO UPDATE SET is_active = true, deactivate_at = NULL;

INSERT INTO app.user_role_relation (user_id, role_id, is_active, assigned_at)
SELECT u.id, r.id, true, now() FROM app.users u JOIN app.roles r ON r.rolename = 'accounting_manager'
WHERE u.username = 'dev_accounting_mgr'
ON CONFLICT (user_id, role_id) DO UPDATE SET is_active = true, deactivate_at = NULL;

-- ─── スコープ検証用: 地域 + 所属拠点 + REGION デモロール（dev 専用） ─────────

-- 地域 'jp'（国内）を作成し、地域未設定の拠点をすべて所属させる
INSERT INTO app.regions (code, name, is_active, updated_at)
VALUES ('jp', '{"ja":"国内","en":"Japan"}', true, now())
ON CONFLICT (code) DO NOTHING;

UPDATE app.plants SET region_id = (SELECT id FROM app.regions WHERE code = 'jp')
WHERE region_id IS NULL;

-- PLANT/REGION スコープを持つ dev ユーザーに全拠点を所属させる
-- （所属ゼロ = fail-closed で何も見えないため。実運用では管理 UI から個別付与）
INSERT INTO app.user_plants (user_id, plant_id)
SELECT u.id, p.id
FROM app.users u CROSS JOIN app.plants p
WHERE u.username IN ('dev_production', 'dev_quality', 'dev_shipping')
ON CONFLICT (user_id, plant_id) DO NOTHING;

INSERT INTO app.user_role_relation (user_id, role_id, is_active, assigned_at)
SELECT u.id, r.id, true, now() FROM app.users u JOIN app.roles r ON r.rolename = 'privileged_operator'
WHERE u.username = 'dev_priv_operator'
ON CONFLICT (user_id, role_id) DO UPDATE SET is_active = true, deactivate_at = NULL;

INSERT INTO app.user_role_relation (user_id, role_id, is_active, assigned_at)
SELECT u.id, r.id, true, now() FROM app.users u JOIN app.roles r ON r.rolename = 'privileged_approver'
WHERE u.username = 'dev_priv_approver'
ON CONFLICT (user_id, role_id) DO UPDATE SET is_active = true, deactivate_at = NULL;

INSERT INTO app.user_role_relation (user_id, role_id, is_active, assigned_at)
SELECT u.id, r.id, true, now() FROM app.users u JOIN app.roles r ON r.rolename = 'kiosk_operator'
WHERE u.username = 'dev_kiosk_op'
ON CONFLICT (user_id, role_id) DO UPDATE SET is_active = true, deactivate_at = NULL;

INSERT INTO app.user_role_relation (user_id, role_id, is_active, assigned_at)
SELECT u.id, r.id, true, now() FROM app.users u JOIN app.roles r ON r.rolename = 'kiosk_approver'
WHERE u.username = 'dev_kiosk_ap'
ON CONFLICT (user_id, role_id) DO UPDATE SET is_active = true, deactivate_at = NULL;

INSERT INTO app.user_role_relation (user_id, role_id, is_active, assigned_at)
SELECT u.id, r.id, true, now() FROM app.users u JOIN app.roles r ON r.rolename = 'user_operator'
WHERE u.username = 'dev_user_op'
ON CONFLICT (user_id, role_id) DO UPDATE SET is_active = true, deactivate_at = NULL;

INSERT INTO app.user_role_relation (user_id, role_id, is_active, assigned_at)
SELECT u.id, r.id, true, now() FROM app.users u JOIN app.roles r ON r.rolename = 'user_approver'
WHERE u.username = 'dev_user_ap'
ON CONFLICT (user_id, role_id) DO UPDATE SET is_active = true, deactivate_at = NULL;

INSERT INTO app.user_role_relation (user_id, role_id, is_active, assigned_at)
SELECT u.id, r.id, true, now() FROM app.users u JOIN app.roles r ON r.rolename = 'security_auditor'
WHERE u.username = 'dev_auditor'
ON CONFLICT (user_id, role_id) DO UPDATE SET is_active = true, deactivate_at = NULL;

-- REGION スコープの e2e 検証用デモロール（dev 専用・is_system=false）:
-- work_order/inventory READ を REGION '{*}' で付与
INSERT INTO app.roles (is_system, rolename, display_name, description) VALUES
  (false, 'dev_region_viewer', '{"ja":"[dev] 地域閲覧","en":"[dev] Region viewer"}',
   '{"ja":"REGION スコープ検証用 — 所属拠点の地域の指示書/在庫を閲覧","en":""}')
ON CONFLICT (rolename) DO NOTHING;

DELETE FROM app.role_permission_relation
WHERE role_id = (SELECT id FROM app.roles WHERE rolename = 'dev_region_viewer');
INSERT INTO app.role_permission_relation (role_id, permission_code, action, scope, scope_values)
SELECT r.id, g.code, g.action::app."ACTION", 'REGION'::app."SCOPE", '{*}'::text[]
FROM app.roles r
CROSS JOIN (VALUES ('work_order','READ'), ('inventory','READ'), ('master','READ')) AS g(code, action)
WHERE r.rolename = 'dev_region_viewer'
ON CONFLICT DO NOTHING;

COMMIT;
