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
    ('dev_viewer', '開発 閲覧', '086b96cb6c3b4230a552e81c8ab17249:8cd4a2aa38dd2048c685c3f682fa74602fc7441c1300734198346c56a57637f6a6e87e080bf647e66f4620073d5b7b9d83f3465b0c25d881c974c0cafb018a1c')
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

COMMIT;
