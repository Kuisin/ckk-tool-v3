-- 価格試算の原価（estimate_cost）。
--
-- 計算基準ごとの「原価」の印から出す原価合計・粗利は、見せる相手を絞る。持たない
-- 人には、サーバーが画面へ渡す前に値ごと落とす（nextjs-web lib/estimate-cost.ts）。
-- 見積単価の計算には関係しない。
--
-- ■ 配るのは管理職（manager）の READ だけ（当面）
-- roles-seed.sql は manager / viewer / 6 つの *_manager に CROSS JOIN app.permissions
-- で全コードを配るので、除外リスト 7 つと DELETE の除外 4 つ、rbac-seed.sql の
-- staff 除外に estimate_cost を足してある。除外し忘れると全員に原価が見える
-- （kiosk で一度起きた罠）。ここでも念のため、既に配られていれば剥がす。

INSERT INTO app.permissions (code, display_name, description) VALUES
  ('estimate_cost',
   '{"ja":"価格試算の原価","en":"Price estimate cost"}',
   '{"ja":"価格試算の原価合計・粗利と、計算基準ごとの原価の印を見る","en":""}')
ON CONFLICT (code) DO UPDATE
  SET display_name = EXCLUDED.display_name,
      description  = EXCLUDED.description;

-- 管理者: 全コード ADMIN（0008 と同じ扱い。system:ADMIN でも通るが表を揃える）。
INSERT INTO app.role_permission_relation (role_id, permission_code, action, scope)
SELECT r.id, 'estimate_cost', 'ADMIN'::app."ACTION", 'ALL'::app."SCOPE"
FROM app.roles r
WHERE r.rolename = 'admin'
ON CONFLICT DO NOTHING;

-- 管理職以外の業務ロールに紛れ込んでいたら剥がす。
DELETE FROM app.role_permission_relation rpr
 USING app.roles r
 WHERE rpr.role_id = r.id
   AND rpr.permission_code = 'estimate_cost'
   AND r.rolename NOT IN ('admin', 'manager');

-- 管理職: READ のみ。
INSERT INTO app.role_permission_relation (role_id, permission_code, action, scope)
SELECT r.id, 'estimate_cost', 'READ'::app."ACTION", 'ALL'::app."SCOPE"
FROM app.roles r
WHERE r.rolename = 'manager'
ON CONFLICT DO NOTHING;
