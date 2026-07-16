-- dev-role-users-seed.sql — ロール別 dev 検証ユーザー（password: dev2026）。
-- 各ロールの権限境界を検証するためのユーザー。冪等。dev 専用 — 本番では
-- roles-seed.sql のロールを実ユーザーへ割り当てる。
-- 適用: cd shared-db && pnpm remote sh -c 'psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f sql/dev-role-users-seed.sql'

BEGIN;

WITH seed(username, display_name, password_hash) AS (
  VALUES
    ('dev_sales', '開発 営業', '887a11c51e56d87c8aa4f8e830f777d0:aff6bdc941bba61aab11b24961428f1d3711864a446381e645a37744d4c98af2e19b889ac8109aea0b03d9405ff737717f8b9d6f8fc85947c1c587fa5e220fde'),
    ('dev_purchasing', '開発 購買', 'd0bdb1aac8638f942174ebff8be449b2:13443690c7ac7e1ef421bac7396d109e1afc6ede20d14298749d46a3cf66fd0009bb49848983cc424f9b88ee8ac12b275ca2d9a5c55b83e64883bc12e9a6f56a'),
    ('dev_production', '開発 製造', '067d944eb8616d056579765ab4aa95ee:5387e592268257f2d5d0c979a8e7f6cec5396c7f7d5f692b22c50fbc396a2bbbb40ca6b1b710f5f0007adaa64503e33da6579ec59a7df10f24e1b5efbab977d4'),
    ('dev_quality', '開発 品質', '4c0c763b704d9f251f23515f0b68b3c8:42b25e967213533dabeeda6742b5885cf2bf7d9a2c798c512c2e4945cdf900b47ae00a0615ad656a0c8b81c807238229729bc630a3b5857e822ed2c28136f82e'),
    ('dev_shipping', '開発 出荷', '9e42af006d4c5f9d0abd3e78d1ba258c:74ce67071bf537236b8e8c32d49e23434793c7b37c8d37cd61b11d1c6b96718951521b1f13b508f65767be5cbe24d5c2447009a22b419a0874a85c86e03afc5e'),
    ('dev_accounting', '開発 経理', '82cc9e348eb0f0a2a33104c97c3813e7:3027b28aee15ef853ceb84407148159ee71a00acb9003be4533e1188899ddfaec4e1149c677ba9e4663e218b4710c6754c483ae7e59d5231283c4730938dd31d'),
    ('dev_manager', '開発 管理職', '80a040e7e5f52a9292dd61a13035b556:417c21a0773bf177daf788ef8ed613c454971f2a6f171b5651849169b7c5efc872533e8325c13fc4e2c28b4ec020997fc161c1078feb0b2739712daa88054e70'),
    ('dev_viewer', '開発 閲覧', '086b96cb6c3b4230a552e81c8ab17249:8cd4a2aa38dd2048c685c3f682fa74602fc7441c1300734198346c56a57637f6a6e87e080bf647e66f4620073d5b7b9d83f3465b0c25d881c974c0cafb018a1c'),
    ('dev_sales_assistant', '開発 営業補佐', '10aec77ceacec9aadf2d9cc6a48f0ce1:3adc930dad3f77fd05edd8aaf9466e3d9d36f760c083f18d3fa68fdb24974303db43bdfa46cad5cc190d25751a55356292a064a9b1310911b09ff528836c4399'),
    ('dev_sales_mgr', '開発 営業部長', '7c1c53fd97ad898334299242604e33f8:1e9c5d4237dbfc4c759796ab99d89e63fdda09494599db6080d5d87c4779325ceaf0486868939551893d4cf09cc068e768223422ca56c57d0783d78ecf0387e3'),
    ('dev_purchasing_mgr', '開発 購買部長', 'a21a1441ec885c4d792d930c4749ea23:378a000f403a0e89d9cf0da84e24d93e1b70662980008a4ac7aa1cf01565e79f3e03b172110f036e5f492858441b970dae8999883497d63d451b805015559cf4'),
    ('dev_production_mgr', '開発 製造部長', '3c60efcf18b8d6c7307c19e88b3694d1:9b980be1f9e363f95f0808eb9944beebeaf8d459005266113638d7de1cd990f57479e6f5e5fed6afb1ef5d9351ff2a934d3b42cbeb307349cf1b6a01a536a61f'),
    ('dev_quality_mgr', '開発 品質部長', '1e347c8cd41c28239feb09c44f171db0:61f8403814fa7b8e86d4981f0763db2d7ff05011eae3c4a1f001a6d6889cfe1a041b2a0c4865583cae0672a1d6043bc2648e00b567b064208d8475f163940bc5'),
    ('dev_shipping_mgr', '開発 出荷部長', '4e38ec525d6ed96eb2f8abb24aa66e41:c6a5ff68d115e390ccc2745f08fe4a6d0eb2eb0feae79714e95f39212b8232e36b5aed21b0403f6f37869cbb76f0f05cab66b509432e63dbd4d837ab214d018e'),
    ('dev_accounting_mgr', '開発 経理部長', '72e5ffc909cee578b0fdc8239fc653d8:26d3b17bfa978cbc98c0b223e04b16ab7ede31cbd382d511667d9ac5ad40afe64cff5e9acb59b30f065eae56cb6f93676d201952f60f4bc210feb6f02113dd08')
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

COMMIT;
