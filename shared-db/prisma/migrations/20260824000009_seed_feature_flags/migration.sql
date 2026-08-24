-- フィーチャーフラグ — main で公開するアプリの一覧。
--
-- 行が無いアプリは本番ランチャーに出ない（既定は非公開）。キーは
-- nextjs-web/src/lib/app-list.ts の featureFlagKey と一致させること。

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
  ('app:user-management:main',        true, 'ユーザー管理 本番公開',    now()),
  ('app:app-management:main',         true, 'アプリ管理 本番公開',      now()),
  ('app:file-management:main',        true, 'ファイル管理 本番公開',    now()),
  ('app:activity-log:main',           true, '操作履歴 本番公開',        now()),
  ('app:links:main',                  true, 'リンク管理 本番公開',      now()),
  ('app:kiosk-cards:main',            true, 'QRカード管理 本番公開',    now())
ON CONFLICT (key) DO UPDATE
  SET is_enabled = EXCLUDED.is_enabled, updated_at = now();

-- 端末管理（SY09）・キオスク設定（SY0A）は dev 検証後に本番公開する。
-- 公開時にコメントを外して再適用:
--   ('app:kiosk-devices:main',  true, '端末管理 本番公開',     now()),
--   ('app:kiosk-settings:main', true, 'キオスク設定 本番公開', now())

-- 注文書取込（SY0C）は取込フォルダ（INTAKE_DIR）が要る。main のアプリには
-- まだ設定・マウントが無いため非公開のまま。公開時は先に INTAKE_DIR を
-- 設定してフォルダをコンテナへマウントし、そのうえで:
--   ('app:order-intake:main', true, '注文書取込 本番公開', now())
