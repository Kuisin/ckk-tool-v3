-- feature-flags-seed.sql — 本番（main）で公開するアプリの明示有効化。冪等。
--
-- 適用: cd shared-db && pnpm remote sh -c 'psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f sql/feature-flags-seed.sql'
--
-- app-flags.ts の main ポリシー「明示的に is_enabled=true の行があるアプリのみ表示」
-- に対応。ここに列挙したアプリだけが本番ランチャー／ホームに表示される
-- （行の無いアプリは本番では非表示。dev は従来どおり既定表示）。
--
-- 公開セット: 販売フロント（試算・価格表・見積書）＋ 試算計算(設定) ＋
--             参照マスタ（顧客・最終需要家・承認グループ）。

BEGIN;

INSERT INTO app.feature_flags (key, is_enabled, description, updated_at) VALUES
  ('app:trial-estimates:main',        true, '試算 本番公開',            now()),
  ('app:price-lists:main',            true, '価格表 本番公開',          now()),
  ('app:quotes:main',                 true, '見積書 本番公開',          now()),
  ('app:trial-pricing-engine:main',   true, '試算計算(設定) 本番公開',  now()),
  ('app:master-customers:main',       true, '顧客 本番公開',            now()),
  ('app:master-end-users:main',       true, '最終需要家 本番公開',      now()),
  ('app:master-approval-groups:main', true, '承認グループ 本番公開',    now())
ON CONFLICT (key) DO UPDATE
  SET is_enabled = EXCLUDED.is_enabled, updated_at = now();

COMMIT;
