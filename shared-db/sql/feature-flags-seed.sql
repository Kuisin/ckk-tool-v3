-- feature-flags-seed.sql — 本番（main）で公開するアプリの明示有効化。冪等。
--
-- 適用: cd shared-db && pnpm remote sh -c 'psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f sql/feature-flags-seed.sql'
--
-- app-flags.ts の main ポリシー「明示的に is_enabled=true の行があるアプリのみ表示」
-- に対応。ここに列挙したアプリだけが本番ランチャー／ホームに表示される
-- （行の無いアプリは本番では非表示。dev は従来どおり既定表示）。
--
-- 公開セット: 販売フロント（試算・価格表・見積書）＋ 試算計算(設定) ＋
--             参照マスタ（取引先・製品・材種・承認グループ）＋
--             システム管理アプリ（system 権限のみに表示 — 旧アバターメニュー
--             リンクの移行先: システム設定・アプリ管理・ファイル管理・操作履歴）。

BEGIN;

INSERT INTO app.feature_flags (key, is_enabled, description, updated_at) VALUES
  ('app:trial-estimates:main',        true, '試算 本番公開',            now()),
  ('app:price-lists:main',            true, '価格表 本番公開',          now()),
  ('app:quotes:main',                 true, '見積書 本番公開',          now()),
  ('app:trial-pricing-engine:main',   true, '試算計算(設定) 本番公開',  now()),
  ('app:product-items:main',          true, '製品項目(設定) 本番公開',  now()),
  ('app:product-types:main',          true, '製品種別(設定) 本番公開',  now()),
  ('app:master-business-partners:main', true, '取引先 本番公開',        now()),
  ('app:master-products:main',        true, '製品 本番公開',            now()),
  ('app:master-material-types:main',  true, '材種 本番公開',            now()),
  ('app:master-approval-groups:main', true, '承認グループ 本番公開',    now()),
  ('app:docs:main',                   true, 'マニュアル 本番公開',      now()),
  ('app:internal-docs:main',          true, '社内ドキュメント 本番公開（閲覧は internal_docs 権限）', now()),
  ('app:system-settings:main',        true, 'システム設定 本番公開',    now()),
  ('app:app-management:main',         true, 'アプリ管理 本番公開',      now()),
  ('app:file-management:main',        true, 'ファイル管理 本番公開',    now()),
  ('app:activity-log:main',           true, '操作履歴 本番公開',        now())
ON CONFLICT (key) DO UPDATE
  SET is_enabled = EXCLUDED.is_enabled, updated_at = now();

-- キオスク管理アプリ（SY08/SY09）は dev 検証後に本番公開する。
-- 公開時にコメントを外して再適用:
--   ('app:kiosk-cards:main',   true, 'QRカード管理 本番公開', now()),
--   ('app:kiosk-devices:main', true, '端末管理 本番公開',     now())

-- 注文書取込（SY0C）は取込フォルダ（INTAKE_DIR）が要る。main のアプリには
-- まだ設定・マウントが無いため非公開のまま。公開時は先に INTAKE_DIR を
-- 設定してフォルダをコンテナへマウントし、そのうえで:
--   ('app:order-intake:main', true, '注文書取込 本番公開', now())

COMMIT;
