-- ユーザー個人の表示設定（言語・日付・時刻・タイムゾーン）。
--
-- 言語 app.users.locale は既にあり（キオスクのランチャーが切り替える）、
-- Web 本体もこれを共有する — 同じ人が Web でもタブレットでも同じ言語で使う。
-- ここではその隣に日付・時刻・タイムゾーンを足す。ユーザー本人が
-- /profile/preferences で変える値で、AD 同期の対象ではない（同期は
-- username / display_name / email などの ID 系だけを触る）。
--
-- 別テーブルにしないのは locale と完全に同じ寿命・同じ更新経路だから
-- （1:1 の設定表を増やすより users の列で持つほうが読み出しが 1 回で済む）。
--
-- 時刻は今までどおり常に UTC（timestamptz）で保存する。time_zone は
-- 「画面に出すときどこの時刻として読むか」だけを決める表示用の設定で、
-- 保存値の意味は変えない。
ALTER TABLE app.users
  ADD COLUMN IF NOT EXISTS date_format varchar(16) NOT NULL DEFAULT 'YYYY/MM/DD',
  ADD COLUMN IF NOT EXISTS time_format varchar(8)  NOT NULL DEFAULT '24h',
  ADD COLUMN IF NOT EXISTS time_zone   varchar(64) NOT NULL DEFAULT 'Asia/Tokyo';

COMMENT ON COLUMN app.users.date_format IS
  '日付の並び（YYYY/MM/DD | YYYY-MM-DD | DD/MM/YYYY | MM/DD/YYYY）。表示のみ。';
COMMENT ON COLUMN app.users.time_format IS
  '時刻表記（24h | 12h）。表示のみ。';
COMMENT ON COLUMN app.users.time_zone IS
  '表示タイムゾーン（IANA 名）。保存は常に UTC で、読み替えだけを決める。';

-- 値の取りうる範囲はアプリ側（lib/user-preferences.ts）が正だが、別経路
-- （psql / 復元スクリプト）で壊れた値が入ると全画面の日時表示が崩れるので、
-- 列挙で足りるものは DB 側にも同じ制約を置く。
--
-- タイムゾーンは CHECK を置かない — 正しさの判定には pg_timezone_names を
-- 引く必要があり、CHECK からはテーブルも非 immutable 関数も参照できない。
-- こちらはアプリ側（Intl の解決可否）で弾き、DB は長さだけを見る。
UPDATE app.users SET locale = 'ja' WHERE locale NOT IN ('ja', 'en', 'zh');

ALTER TABLE app.users
  DROP CONSTRAINT IF EXISTS users_date_format_check,
  DROP CONSTRAINT IF EXISTS users_time_format_check,
  DROP CONSTRAINT IF EXISTS users_locale_check;

ALTER TABLE app.users
  ADD CONSTRAINT users_date_format_check
    CHECK (date_format IN ('YYYY/MM/DD', 'YYYY-MM-DD', 'DD/MM/YYYY', 'MM/DD/YYYY')),
  ADD CONSTRAINT users_time_format_check
    CHECK (time_format IN ('24h', '12h')),
  ADD CONSTRAINT users_locale_check
    CHECK (locale IN ('ja', 'en', 'zh'));
