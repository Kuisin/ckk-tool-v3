-- 学習した照合名 — 人が手で結び付けた「印字された表記 → マスタ」。
--
-- 取込の突合が外れると人が画面で正しい取引先・製品を選ぶ。その判断は
-- これまで 1 回きりで捨てられていて、同じ書式の注文書が来るたびに同じ
-- 直しをしていた。ここに貯めて次から自動で当てる。
--
-- **1 表記 = 1 マスタ**。unique(target_type, alias_key) なので、後から別の
-- マスタへ結び直すと行が移る（最後の訂正が勝つ）。曖昧さが残らないから、
-- 突合側は当たった時点で自動確定してよい。
--
-- マスタ側の match_names（予想して登録する別名）とは役割が違う —
-- こちらは実績から貯まる。
CREATE TABLE IF NOT EXISTS app.match_aliases (
  id           serial       PRIMARY KEY,
  -- テーブル名（audit_logs / approval_requests と同じ多態規約）。
  target_type  text         NOT NULL,
  -- マスタ行の内部 id を文字列化したもの（BP は uuid、製品は連番）。
  -- FK は張れない（多態）ので、マスタを消しても行は残る。
  target_id    text         NOT NULL,
  -- 書類に印字されていた表記（そのまま）。
  alias        text         NOT NULL,
  -- 突合用の正規化キー（アプリ側 lib/bp-match / lib/product-match で作る）。
  alias_key    text         NOT NULL,
  hit_count    integer      NOT NULL DEFAULT 0,
  last_seen_at timestamptz  NOT NULL DEFAULT now(),
  created_by   uuid         REFERENCES app.users(id),
  created_at   timestamptz  NOT NULL DEFAULT now(),
  updated_at   timestamptz  NOT NULL DEFAULT now(),
  CONSTRAINT match_aliases_target_type_check
    CHECK (target_type IN ('business_partners', 'products'))
);

COMMENT ON TABLE app.match_aliases IS
  '学習した照合名（人が手で結び付けた「印字された表記 → マスタ」）。1 表記 = 1 マスタ。';

-- 突合はこのキーで 1 回引くだけ。
CREATE UNIQUE INDEX IF NOT EXISTS match_aliases_target_type_alias_key_key
  ON app.match_aliases (target_type, alias_key);
-- マスタ 1 件の学習済み表記を並べる（詳細画面・整理用）。
CREATE INDEX IF NOT EXISTS match_aliases_target_type_target_id_idx
  ON app.match_aliases (target_type, target_id);
