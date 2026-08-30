-- 特権アクセス — システム上重要な操作を「申請 → 別の人の承認 → 期限つきで実行」に分ける。
--
-- 背景: これまで PIN の開示もカードの発行も利用停止も、権限コード kiosk / system を
-- 持っていれば即座にできた。そしてその 2 コードは業務ロールに一切配られていない
-- （roles-seed.sql が明示的に除外している）ので、端末運用を任せるには管理者に
-- するしかなかった。粒度を割り、恒久的な保有と一時的な行使を分ける。
--
-- 方式は 2 つ（形が違うので分けてある。詳細は security.prisma のコメント）:
--   A 時限昇格   privileged_access_requests / _operations
--   B 変更依頼   user_change_requests
--
-- 有効期限の判定は**常にアプリ側の時刻式**で行う。ここで作る status は表示用で、
-- EXPIRED の打刻を待って判定してはいけない（cron の遅れがアクセスを増やす側に倒れる）。

-- ─── 1. enum ────────────────────────────────────────────────────────────────
CREATE TYPE app."PRIVILEGED_REQUEST_STATUS" AS ENUM (
  'PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', 'REVOKED', 'EXPIRED'
);

CREATE TYPE app."USER_CHANGE_KIND" AS ENUM (
  'SUSPEND', 'RESTORE', 'UPDATE_PLANTS'
);

-- ─── 2. A: 時限昇格 ─────────────────────────────────────────────────────────
CREATE TABLE app.privileged_access_requests (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code              VARCHAR(64) NOT NULL,
  status            app."PRIVILEGED_REQUEST_STATUS" NOT NULL DEFAULT 'PENDING',
  reason            TEXT NOT NULL,

  window_starts_at  TIMESTAMPTZ(6) NOT NULL,
  window_ends_at    TIMESTAMPTZ(6) NOT NULL,
  duration_minutes  INTEGER NOT NULL,
  activated_at      TIMESTAMPTZ(6),
  last_used_at      TIMESTAMPTZ(6),
  use_count         INTEGER NOT NULL DEFAULT 0,

  requested_by      UUID NOT NULL,
  requested_at      TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  decided_by        UUID,
  decided_at        TIMESTAMPTZ(6),
  decision_comment  TEXT,
  revoked_by        UUID,
  revoked_at        TIMESTAMPTZ(6),
  revoke_reason     TEXT,

  CONSTRAINT privileged_access_requests_requested_by_fkey
    FOREIGN KEY (requested_by) REFERENCES app.users(id) ON DELETE NO ACTION ON UPDATE CASCADE,
  CONSTRAINT privileged_access_requests_decided_by_fkey
    FOREIGN KEY (decided_by) REFERENCES app.users(id) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT privileged_access_requests_revoked_by_fkey
    FOREIGN KEY (revoked_by) REFERENCES app.users(id) ON DELETE SET NULL ON UPDATE CASCADE,

  -- 窓の向き
  CONSTRAINT privileged_access_window_order
    CHECK (window_ends_at > window_starts_at),
  -- **上限は申請時点から 2 週間**。アプリ側の validateRequestWindow の双子で、
  -- 画面を通さない呼び出し（直接 POST）でも超えられないようにここにも置く。
  CONSTRAINT privileged_access_window_max_14d
    CHECK (window_ends_at <= requested_at + interval '14 days'),
  -- 遡っての付与を作らせない。1 分の緩みは時計ずれと往復ぶん。
  CONSTRAINT privileged_access_window_not_backdated
    CHECK (window_starts_at >= requested_at - interval '1 minute'),
  CONSTRAINT privileged_access_duration_range
    CHECK (duration_minutes BETWEEN 1 AND 1440),
  -- 「なぜ」の無い特権付与を作らない
  CONSTRAINT privileged_access_reason_not_blank
    CHECK (btrim(reason) <> ''),
  -- 承認済みなら決裁者が必ず居る
  CONSTRAINT privileged_access_approved_has_decider
    CHECK (status <> 'APPROVED' OR decided_by IS NOT NULL)
);

CREATE INDEX privileged_access_requests_requested_by_status_idx
  ON app.privileged_access_requests (requested_by, status);
CREATE INDEX privileged_access_requests_code_status_idx
  ON app.privileged_access_requests (code, status);
CREATE INDEX privileged_access_requests_requested_at_idx
  ON app.privileged_access_requests (requested_at DESC);

-- 同じコードの申請を同時に何本も出させない（approval_requests_pending_unique と同じ手）。
CREATE UNIQUE INDEX privileged_access_pending_unique
  ON app.privileged_access_requests (requested_by, code)
  WHERE status = 'PENDING';

COMMENT ON TABLE app.privileged_access_requests IS
  '時限昇格の申請。承認で「使ってよい」になるが、時計は初回使用（activated_at）から動き、min(初回使用+duration, window_ends_at) で切れる';
COMMENT ON COLUMN app.privileged_access_requests.activated_at IS
  '初回使用時刻。null = 未使用 = 時計が動いていない。画面を開いただけでは埋まらない';

CREATE TABLE app.privileged_access_request_operations (
  request_id UUID NOT NULL,
  operation  VARCHAR(64) NOT NULL,
  granted    BOOLEAN NOT NULL DEFAULT false,

  CONSTRAINT privileged_access_request_operations_pkey PRIMARY KEY (request_id, operation),
  CONSTRAINT privileged_access_request_operations_request_id_fkey
    FOREIGN KEY (request_id) REFERENCES app.privileged_access_requests(id)
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX privileged_access_request_operations_operation_idx
  ON app.privileged_access_request_operations (operation);

COMMENT ON COLUMN app.privileged_access_request_operations.granted IS
  '承認時に確定。承認者は要求された操作の一部だけを許可できる（却下せずに絞るため）';

-- ─── 3. B: ユーザー変更依頼 ─────────────────────────────────────────────────
CREATE TABLE app.user_change_requests (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind              app."USER_CHANGE_KIND" NOT NULL,
  target_user_id    UUID NOT NULL,
  payload           JSONB NOT NULL,
  reason            TEXT NOT NULL,
  status            app."PRIVILEGED_REQUEST_STATUS" NOT NULL DEFAULT 'PENDING',

  requested_by      UUID NOT NULL,
  requested_at      TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  decided_by        UUID,
  decided_at        TIMESTAMPTZ(6),
  decision_comment  TEXT,
  applied_at        TIMESTAMPTZ(6),
  apply_error       TEXT,

  CONSTRAINT user_change_requests_target_user_id_fkey
    FOREIGN KEY (target_user_id) REFERENCES app.users(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT user_change_requests_requested_by_fkey
    FOREIGN KEY (requested_by) REFERENCES app.users(id) ON DELETE NO ACTION ON UPDATE CASCADE,
  CONSTRAINT user_change_requests_decided_by_fkey
    FOREIGN KEY (decided_by) REFERENCES app.users(id) ON DELETE SET NULL ON UPDATE CASCADE,

  CONSTRAINT user_change_reason_not_blank
    CHECK (btrim(reason) <> ''),
  CONSTRAINT user_change_approved_has_decider
    CHECK (status <> 'APPROVED' OR decided_by IS NOT NULL),
  -- 自分に対する変更を自分で申請させない（承認者 ≠ 申請者 はアプリ側で見る）
  CONSTRAINT user_change_not_self
    CHECK (requested_by <> target_user_id)
);

CREATE INDEX user_change_requests_status_idx
  ON app.user_change_requests (status);
CREATE INDEX user_change_requests_target_user_id_idx
  ON app.user_change_requests (target_user_id);
CREATE INDEX user_change_requests_requested_at_idx
  ON app.user_change_requests (requested_at DESC);

-- 同じ人・同じ種類の依頼を二重に出させない。
CREATE UNIQUE INDEX user_change_requests_pending_unique
  ON app.user_change_requests (target_user_id, kind)
  WHERE status = 'PENDING';

COMMENT ON TABLE app.user_change_requests IS
  'ユーザーへの変更依頼。承認がその変更を適用する（窓も duration も無い）。適用は通常の変更関数を通すので、前提が崩れていれば apply_error に落ちる';

-- ─── 4. 権限コード ──────────────────────────────────────────────────────────
-- 粗い kiosk / system を割る。既存コードは残り、下の操作だけが移る。
INSERT INTO app.permissions (code, display_name, description) VALUES
  ('kiosk_secret',  '{"ja":"キオスク端末の秘密","en":"Kiosk device secrets"}',
   '{"ja":"メンテナンス退出 PIN・端末設定コードの開示と再生成、端末鍵のリセット。申請 → 承認 → 期限つきで行使する","en":""}'),
  ('kiosk_device',  '{"ja":"端末アクセスの付与","en":"Kiosk device enrolment"}',
   '{"ja":"端末プロファイルの作成・リンク・有効化・停止・失効。端末を入れることはアクセスを与えること","en":""}'),
  ('kiosk_card',    '{"ja":"QRカードの発行・PIN","en":"Kiosk card issuance"}',
   '{"ja":"カードの発行・割当・失効・PIN リセット・台紙の印刷。QR は認証情報そのもの","en":""}'),
  ('personal_data', '{"ja":"個人データの閲覧","en":"Personal data access"}',
   '{"ja":"ログイン履歴の詳細と操作履歴の横断検索。書類ごとの履歴タブは対象外（その書類の権限で見る）","en":""}'),
  ('user_admin',    '{"ja":"ユーザー・権限の変更","en":"User administration"}',
   '{"ja":"利用停止・復帰・所属拠点の変更。1 操作ごとに変更依頼を出し、承認が適用する","en":""}')
ON CONFLICT (code) DO UPDATE
  SET display_name = EXCLUDED.display_name,
      description  = EXCLUDED.description;

-- admin: 全コード ADMIN（0008 / 20260903090000 と同じ扱い。管理者は素通しする）
INSERT INTO app.role_permission_relation (role_id, permission_code, action, scope)
SELECT r.id, c.code, 'ADMIN'::app."ACTION", 'ALL'::app."SCOPE"
FROM app.roles r
CROSS JOIN (VALUES ('kiosk_secret'),('kiosk_device'),('kiosk_card'),('personal_data'),('user_admin')) AS c(code)
WHERE r.rolename = 'admin'
ON CONFLICT DO NOTHING;

-- ─── 5. ロール ──────────────────────────────────────────────────────────────
-- これらのコードを持てるロールが 1 つも無いと、機能は誰にも届かない。
-- 申請する人と承認する人を**別のロール**にするのがこの機能の要点なので、
-- privileged_approver には申請側のグラントを一切与えない
-- （承認者は PIN の開示を許可できるが、自分では開示できない）。
INSERT INTO app.roles (is_system, rolename, display_name, description) VALUES
  (true, 'privileged_operator', '{"ja":"特権操作（申請）","en":"Privileged operator"}',
   '{"ja":"端末の秘密・端末アクセス・QRカード・個人データ・ユーザー変更を申請できる。実行は承認と期限の範囲内","en":""}'),
  (true, 'privileged_approver', '{"ja":"特権操作（承認）","en":"Privileged approver"}',
   '{"ja":"特権操作の申請を承認・差し戻しできる。**自分では実行できない**（申請側の権限を持たない）","en":""}')
ON CONFLICT (rolename) DO UPDATE
  SET display_name = EXCLUDED.display_name,
      description  = EXCLUDED.description;

-- 申請側: 各コードに実務アクション。scope は ALL（対象を絞る軸ではないため —
-- 実際に何ができるかは承認された操作 (granted) が決める）。
INSERT INTO app.role_permission_relation (role_id, permission_code, action, scope)
SELECT r.id, g.code, g.action::app."ACTION", 'ALL'::app."SCOPE"
FROM app.roles r
CROSS JOIN (VALUES
  ('kiosk_secret',  'READ'),
  ('kiosk_secret',  'UPDATE'),
  ('kiosk_device',  'READ'),
  ('kiosk_device',  'CREATE'),
  ('kiosk_device',  'UPDATE'),
  ('kiosk_card',    'READ'),
  ('kiosk_card',    'CREATE'),
  ('kiosk_card',    'UPDATE'),
  ('personal_data', 'READ'),
  -- user_admin は READ も要る。SY01 の入口は requireAppRead = READ なので、
  -- UPDATE だけ配ると「変更依頼を出す画面に入れない」ことになる（実機で踏んだ）。
  ('user_admin',    'READ'),
  ('user_admin',    'UPDATE')
) AS g(code, action)
WHERE r.rolename = 'privileged_operator'
ON CONFLICT DO NOTHING;

-- 申請側は対象画面に入れる必要がある。**system:READ は配らない** — あれを渡すと
-- SY02 試算計算 / SY0E AI プロバイダ など、この機能と関係の無いシステム画面まで
-- まとめて開いてしまう。画面の入口自体を新しいコードへ寄せ（下の 6.）、
-- ここで要るのは SY09 端末管理 / SY0A キオスク設定 の入口である kiosk:READ だけ。
INSERT INTO app.role_permission_relation (role_id, permission_code, action, scope)
SELECT r.id, 'kiosk', 'READ'::app."ACTION", 'ALL'::app."SCOPE"
FROM app.roles r
WHERE r.rolename = 'privileged_operator'
ON CONFLICT DO NOTHING;

-- 承認側: APPROVE のみ。**申請側のグラントは配らない**（それがこの分離の本体）。
INSERT INTO app.role_permission_relation (role_id, permission_code, action, scope)
SELECT r.id, c.code, 'APPROVE'::app."ACTION", 'ALL'::app."SCOPE"
FROM app.roles r
CROSS JOIN (VALUES ('kiosk_secret'),('kiosk_device'),('kiosk_card'),('personal_data'),('user_admin')) AS c(code)
WHERE r.rolename = 'privileged_approver'
ON CONFLICT DO NOTHING;

-- 承認側にはこれ以上何も配らない。承認画面 SY0F は requiredPermission=null で
-- 開けるし、決裁に要る情報（申請者名・対象者名）は SY0F のデータ関数が
-- APPROVE 権限を確認したうえで読む。閲覧権限を足すと「承認者なのに中身が見える」
-- が少しずつ広がるので、ここは意図的に APPROVE だけにする。

-- ─── 6. 画面の入口を新しいコードへ寄せる ───────────────────────────────────
-- app-list.ts の requiredPermission と対になる変更。これまで system / kiosk の
-- 1 コードが入口だった画面を、それぞれの新コードに移す。
--   SY01 ユーザー管理   system → user_admin
--   SY07 操作履歴       system → personal_data
--   SY0D ログイン履歴   system → personal_data
--   SY08 QRカード管理   kiosk  → kiosk_card
-- （SY09 端末管理 / SY0A キオスク設定 は kiosk のまま — SY09 は秘密と端末アクセスの
--   両方を載せる画面なので、入口は粗いままにして操作ごとに昇格を求める）
--
-- 業務ロールは system も kiosk も持っていない（roles-seed.sql が全ロールで除外して
-- いる）ので、この付け替えで閲覧できなくなる人は居ない。admin は 5 コードすべてに
-- ADMIN を持ち、かつ system:ADMIN でスーパーユーザーなので影響しない。
