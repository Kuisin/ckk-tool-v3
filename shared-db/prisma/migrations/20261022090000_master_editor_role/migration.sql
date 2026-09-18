-- master_editor — マスタを編集できる専用ロール。
--
-- なぜ要るか: マスタ編集（`master` の C/U/D）を持っていたのは admin と staff だけ
-- だった。15 の業務ロールはすべて `master:READ` 止まりなので、「取引先や製品を
-- 登録したいだけの人」に渡せるものが
--   admin  … system / kiosk / 特権コードまで丸ごと付く
--   staff  … 見積から請求まで全業務コードを ALL スコープでフル操作できる
-- の 2 択しかなく、どちらも要求よりはるかに広い。その 1 点だけを切り出す。
--
-- **単機能にしてある** — 業務書類の READ すら持たない。RBAC は grant 行の和集合
-- （packages/authz-core decide()）なので、`sales` + `master_editor` のように
-- 部門ロールへ重ねて割り当てる前提。ここに「ついでの閲覧」を足すと、部門ロールと
-- 重なった部分がどちらの意図だったのか後から読めなくなる。
--
-- **EXPORT は配らない。** `master` の EXPORT を見ている呼び出し口が 1 つも無く
-- （C/U/D は 20 箇所以上ある）、誰も読まない grant を置くと権限表が実際より広く
-- 見える。マスタの書き出しを作るときに、その migration で一緒に足すこと。
--
-- 対応する seed: shared-db/sql/roles-seed.sql（撮影用 DB 側の同じ内容）。

BEGIN;

INSERT INTO app.roles (is_system, rolename, display_name, description) VALUES
  (true, 'master_editor', '{"ja":"マスタ管理","en":"Master data editor"}',
   '{"ja":"マスタ（取引先・製品・素材・工程など）の登録・編集。業務書類の権限は持たないので、部門ロールと併せて割り当てる","en":""}')
ON CONFLICT (rolename) DO UPDATE
  SET display_name = EXCLUDED.display_name,
      description  = EXCLUDED.description;

INSERT INTO app.role_permission_relation (role_id, permission_code, action, scope)
SELECT r.id, 'master', a.action::app."ACTION", 'ALL'::app."SCOPE"
FROM app.roles r
CROSS JOIN (VALUES ('READ'),('CREATE'),('UPDATE'),('DELETE')) AS a(action)
WHERE r.rolename = 'master_editor'
ON CONFLICT DO NOTHING;

COMMIT;
