-- 認証イベントの記録（login_attempts）と端末の同定材料。
--
-- ■ なぜ要るのか
-- これまで**ログイン失敗は 1 行も残っていなかった**。キオスクは PIN 誤りで
-- kiosk_cards.pin_failed_attempts を進めるだけ（未知カード・停止カード・
-- 期限切れチケット・アテステーション失敗は完全に無記録）、Web は
-- インメモリのレート制限と console 出力だけ。15 分のロックが明けた後、
-- 管理者が「何が起きたか」を見る手段が存在しない。
--
-- ■ なぜ audit_logs ではないのか
-- audit_logs は「ログイン済みの人が何をしたか」の台帳で、actor(user_id) が
-- あることが前提。ログイン失敗はまさに actor が確定しない事象で、そこには
-- 表現できない。kiosk_device_logs は端末プレゼンスの遷移ログで Web を持てない。
-- 両方をまたぐ 1 本のテーブルを新設する（_specs/tables.md の system_logs は
-- 設計だけで存在しなかった。この migration がその意図の最初の実装）。
--
-- ■ 生の秘密を保存しない設計
-- kiosk_cards.id は QR に刷ってある secret そのもの。実在しないカードを読んだ
-- 失敗行に生値を書くと、偽造カードの中身と正規カードの secret が同じ列に
-- 溜まる。実在したカードだけ FK で参照し、それ以外は pepper 付き HMAC の
-- 相関キー（card_ref）だけを残す。ユーザー名も同様で、実在ユーザーに解決
-- できたときだけ生値を持つ（未知の文字列にはパスワードの打ち間違いが
-- 混ざりうる）。これは CHECK 制約でも強制する。
--
-- ■ 個人データの扱い
-- signals（TZ・言語・ハードウェア構成）は従業員監視に隣接する。SY0D は
-- system 権限（管理者のみ）で閉じ、保持期間を pg_cron で切り（sql/security-cron.sql）、
-- metabase_ro からはテーブルごと剥がす（sql/grants.sql）。3 点セットで初めて
-- 成立する設計なので、どれか 1 つでも欠けたら見直すこと。

-- ── enum ────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
                 WHERE t.typname = 'LOGIN_APP' AND n.nspname = 'app') THEN
    CREATE TYPE "app"."LOGIN_APP" AS ENUM ('WEB', 'KIOSK');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
                 WHERE t.typname = 'LOGIN_OUTCOME' AND n.nspname = 'app') THEN
    CREATE TYPE "app"."LOGIN_OUTCOME" AS ENUM ('SUCCESS', 'FAILURE');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
                 WHERE t.typname = 'DEVICE_OWNERSHIP' AND n.nspname = 'app') THEN
    CREATE TYPE "app"."DEVICE_OWNERSHIP" AS ENUM
      ('COMPANY_MANAGED', 'COMPANY_NETWORK', 'UNMANAGED', 'UNKNOWN');
  END IF;
END $$;

-- ── Web ブラウザ端末台帳 ────────────────────────────────────────────────────
-- 1 行 = (ユーザー, シグネチャ)。端末の**同定**ではなく「いつもの端末か」の目安。

CREATE TABLE IF NOT EXISTS "app"."user_devices" (
  "id"               UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id"          UUID NOT NULL,
  "fingerprint"      CHAR(64) NOT NULL,
  "signals_version"  SMALLINT NOT NULL,
  "label"            VARCHAR(80),
  "ownership"        "app"."DEVICE_OWNERSHIP" NOT NULL DEFAULT 'UNKNOWN',
  "ownership_source" VARCHAR(40),
  "signals"          JSONB,
  "user_agent"       VARCHAR(512),
  "last_ip_address"  INET,
  "login_count"      INTEGER NOT NULL DEFAULT 0,
  "first_seen_at"    TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_seen_at"     TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "user_devices_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "user_devices_user_id_fingerprint_key"
  ON "app"."user_devices" ("user_id", "fingerprint");
CREATE INDEX IF NOT EXISTS "user_devices_fingerprint_idx"
  ON "app"."user_devices" ("fingerprint");
CREATE INDEX IF NOT EXISTS "user_devices_last_seen_at_idx"
  ON "app"."user_devices" ("last_seen_at");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_devices_user_id_fkey') THEN
    ALTER TABLE "app"."user_devices"
      ADD CONSTRAINT "user_devices_user_id_fkey"
      FOREIGN KEY ("user_id") REFERENCES "app"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- ── 認証イベント ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "app"."login_attempts" (
  "id"                  BIGSERIAL NOT NULL,
  "created_at"          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "app"                 "app"."LOGIN_APP" NOT NULL,
  "outcome"             "app"."LOGIN_OUTCOME" NOT NULL,
  "method"              VARCHAR(24) NOT NULL,
  "reason"              VARCHAR(40),
  "user_id"             UUID,
  "identifier"          VARCHAR(120),
  "identifier_ref"      CHAR(64),
  "card_id"             TEXT,
  "card_ref"            CHAR(64),
  "scan_kind"           VARCHAR(16),
  "kiosk_device_id"     UUID,
  "user_device_id"      UUID,
  "ip_address"          INET,
  "ip_chain"            VARCHAR(200),
  "user_agent"          VARCHAR(512),
  "signals_fingerprint" CHAR(64),
  "signals_version"     SMALLINT,
  "signals"             JSONB,
  "ownership"           "app"."DEVICE_OWNERSHIP" NOT NULL DEFAULT 'UNKNOWN',
  "ownership_source"    VARCHAR(40),
  CONSTRAINT "login_attempts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "login_attempts_created_at_idx"
  ON "app"."login_attempts" ("created_at" DESC);
CREATE INDEX IF NOT EXISTS "login_attempts_user_id_created_at_idx"
  ON "app"."login_attempts" ("user_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "login_attempts_identifier_ref_created_at_idx"
  ON "app"."login_attempts" ("identifier_ref", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "login_attempts_ip_address_created_at_idx"
  ON "app"."login_attempts" ("ip_address", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "login_attempts_signals_fingerprint_created_at_idx"
  ON "app"."login_attempts" ("signals_fingerprint", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "login_attempts_kiosk_device_id_created_at_idx"
  ON "app"."login_attempts" ("kiosk_device_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "login_attempts_card_ref_created_at_idx"
  ON "app"."login_attempts" ("card_ref", "created_at" DESC);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'login_attempts_user_id_fkey') THEN
    ALTER TABLE "app"."login_attempts"
      ADD CONSTRAINT "login_attempts_user_id_fkey"
      FOREIGN KEY ("user_id") REFERENCES "app"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'login_attempts_card_id_fkey') THEN
    ALTER TABLE "app"."login_attempts"
      ADD CONSTRAINT "login_attempts_card_id_fkey"
      FOREIGN KEY ("card_id") REFERENCES "app"."kiosk_cards"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'login_attempts_kiosk_device_id_fkey') THEN
    ALTER TABLE "app"."login_attempts"
      ADD CONSTRAINT "login_attempts_kiosk_device_id_fkey"
      FOREIGN KEY ("kiosk_device_id") REFERENCES "app"."kiosk_devices"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'login_attempts_user_device_id_fkey') THEN
    ALTER TABLE "app"."login_attempts"
      ADD CONSTRAINT "login_attempts_user_device_id_fkey"
      FOREIGN KEY ("user_device_id") REFERENCES "app"."user_devices"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- 失敗だけを新しい順に引く（SY0D の既定表示・アラート）ための部分索引。
-- 成功行のほうが桁違いに多いので、全体索引だけでは失敗の走査が重い。
CREATE INDEX IF NOT EXISTS "login_attempts_failure_idx"
  ON "app"."login_attempts" ("created_at" DESC)
  WHERE "outcome" = 'FAILURE';

DO $$
BEGIN
  -- 生のユーザー名は「実在ユーザーに解決できたとき」だけ、をアプリ任せにしない。
  -- ここを DB で縛らないと、うっかり打ち間違いのパスワードが列に溜まりうる。
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'login_attempts_identifier_resolved') THEN
    ALTER TABLE "app"."login_attempts"
      ADD CONSTRAINT "login_attempts_identifier_resolved"
      CHECK ("identifier" IS NULL OR "user_id" IS NOT NULL);
  END IF;
  -- signals は「将来のための箱」なので、悪意あるクライアントの肥大化を DB でも止める。
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'login_attempts_signals_size') THEN
    ALTER TABLE "app"."login_attempts"
      ADD CONSTRAINT "login_attempts_signals_size"
      CHECK ("signals" IS NULL OR pg_column_size("signals") <= 8192);
  END IF;
END $$;

COMMENT ON TABLE "app"."login_attempts" IS
  '認証イベント（成功・失敗の両方）。失敗は actor が確定しないので audit_logs では表現できない';
COMMENT ON COLUMN "app"."login_attempts"."identifier" IS
  '入力ユーザー名。実在ユーザーに解決できたときのみ（CHECK で強制）';
COMMENT ON COLUMN "app"."login_attempts"."identifier_ref" IS
  'HMAC(pepper, 入力ユーザー名)。未知ユーザー名への連続試行を、値を残さず数えるため';
COMMENT ON COLUMN "app"."login_attempts"."card_ref" IS
  'HMAC(pepper, 正規化スキャン値)。QR の生値は保存しない（kiosk_cards.id は secret そのもの）';
COMMENT ON COLUMN "app"."login_attempts"."scan_kind" IS
  '読み取ったペイロードの種別のみ（CARD/WO/OTHER/MALFORMED/EMPTY）。中身は残さない';
COMMENT ON COLUMN "app"."login_attempts"."signals_fingerprint" IS
  'サーバーが再計算したブラウザ端末シグネチャ。**認証要素ではない**（kiosk_devices.fingerprint = 鍵の指紋とは別物）';
COMMENT ON COLUMN "app"."login_attempts"."ip_chain" IS
  'x-forwarded-for の生チェーン。信頼ホップ数の設定を後から直したとき、過去分を再解釈するため';
COMMENT ON COLUMN "app"."login_attempts"."ip_address" IS
  '送信元 IP。**必ず正規形で書くこと**（lib/cidr-core normalizeIp）。inet の <<= は ::ffff:192.168.50.7 を 192.168.50.0/24 に含めないので、v4-mapped のまま入れると CIDR 絞り込みから漏れる';
COMMENT ON TABLE "app"."user_devices" IS
  'Web ブラウザ端末台帳。端末の同定ではなく「この人がいつも使っている端末か」の目安';

-- ── キオスク端末: 所有区分と署名済みプロファイル ────────────────────────────

ALTER TABLE "app"."kiosk_devices"
  ADD COLUMN IF NOT EXISTS "linked_user_agent"       TEXT,
  ADD COLUMN IF NOT EXISTS "linked_ip_address"       TEXT,
  ADD COLUMN IF NOT EXISTS "ownership"               "app"."DEVICE_OWNERSHIP" NOT NULL DEFAULT 'UNKNOWN',
  ADD COLUMN IF NOT EXISTS "ownership_source"        VARCHAR(40),
  ADD COLUMN IF NOT EXISTS "device_profile"          JSONB,
  ADD COLUMN IF NOT EXISTS "device_profile_payload"  TEXT,
  ADD COLUMN IF NOT EXISTS "device_profile_sig"      TEXT,
  ADD COLUMN IF NOT EXISTS "device_profile_at"       TIMESTAMPTZ;

-- user_agent / last_ip_address は今まで「リンクした時点のスナップショット」
-- （kiosk_link_requests からの複写・以後不変）だった。本変更から「最後に観測
-- した値」に意味が変わるので、既存の値をリンク時スナップショット側へ退避する。
-- どの画面にも出ていない列なので、この読み替えは表示に影響しない。
UPDATE "app"."kiosk_devices"
   SET "linked_user_agent" = "user_agent",
       "linked_ip_address" = "last_ip_address"
 WHERE "linked_user_agent" IS NULL
   AND "linked_ip_address" IS NULL
   AND ("user_agent" IS NOT NULL OR "last_ip_address" IS NOT NULL);

COMMENT ON COLUMN "app"."kiosk_devices"."user_agent" IS
  '最後に観測した UA（従来はリンク時固定。リンク時の値は linked_user_agent）';
COMMENT ON COLUMN "app"."kiosk_devices"."last_ip_address" IS
  '最後に観測した IP（従来はリンク時固定。リンク時の値は linked_ip_address）';
COMMENT ON COLUMN "app"."kiosk_devices"."ownership_source" IS
  '所有区分の判定根拠（wrapper:device-owner / kiosk:token / cidr:inside …）。なぜそう判定したかを監査できるように必ず残す';
COMMENT ON COLUMN "app"."kiosk_devices"."device_profile_payload" IS
  '署名対象そのままの文字列。後から独立に再検証できる証拠として、parse 済み JSON とは別に残す';
