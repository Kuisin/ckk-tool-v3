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
--             システム管理アプリ（system 権限のみに表示 — ユーザー管理・
--             アプリ管理・ファイル管理・操作履歴・リンク管理）＋ QRカード管理。
--
-- キーは app-list.ts の `key` と一致していなければならない（一致しない行は
-- どのアプリにも効かない死にデータ）。以前あった `app:system-settings:main` は
-- システム設定ハブ廃止で該当アプリが無くなったため、後継の
-- `app:user-management:main`（SY01）へ置き換えた。

BEGIN;

INSERT INTO app.feature_flags (key, is_enabled, description, updated_at) VALUES
  ('app:trial-estimates:main',        true, '価格試算 本番公開',            now()),
  ('app:price-lists:main',            true, '価格表 本番公開',          now()),
  ('app:quotes:main',                 true, '見積書 本番公開',          now()),
  ('app:trial-pricing-engine:main',   true, '価格試算計算(設定) 本番公開',  now()),
  ('app:product-items:main',          true, '製品項目(設定) 本番公開',  now()),
  ('app:product-types:main',          true, '製品種別(設定) 本番公開',  now()),
  ('app:master-business-partners:main', true, '取引先 本番公開',        now()),
  ('app:master-products:main',        true, '製品 本番公開',            now()),
  ('app:master-material-types:main',  true, '材種 本番公開',            now()),
  ('app:master-approval-groups:main', true, '承認グループ 本番公開',    now()),
  ('app:docs:main',                   true, 'マニュアル 本番公開',      now()),
  ('app:admin-manual:main',          true, '管理マニュアル 本番公開（閲覧は admin_manual 権限）', now()),
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

-- 設計依頼書（SA06）は **承認フローの設定が前提**。承認設定（MS0B）で
-- 「設計依頼書」の段を 1 つ以上作っておかないと、公開しても「承認依頼」が
-- 「承認フローが未設定です」で止まり、下書きから先へ進めない。
-- あわせて roles-seed.sql を本番へ再適用しておくこと（production ロールの
-- design_request R·U — 無いと担当者が通知を開いた先で 403 になる）。
--
-- **設計図（PD06）とセットで公開すること。** 依頼の「完了」には、その依頼を
-- 成果物とする版が 1 件以上必要で、版を登録できるのは設計図だけ。設計図を
-- 公開せずに設計依頼だけ出すと、進行中のまま完了できない依頼が溜まる。
-- 両方を済ませて dev で受け入れたら:
--   ('app:design-requests:main', true, '設計依頼書 本番公開', now()),
--   ('app:design-files:main',    true, '設計図 本番公開',     now())

-- ログイン履歴（SY0D）は dev で記録が溜まるのを確認してから本番公開する。
-- 先に本番の env（LOGIN_ATTEMPT_PEPPER / CORPORATE_CIDRS /
-- TRUSTED_PROXY_HOPS）を入れておくこと — 未設定でも落ちないが、相関キーも
-- 所有区分も付かない空の履歴になる。公開時:
--   ('app:login-history:main', true, 'ログイン履歴 本番公開', now())

-- AI プロバイダ（SY0E）は **本番の env に SETTINGS_ENCRYPTION_KEY を入れてから**
-- 公開する。未設定のままだと API トークンを保存できず（守れない秘密は預からない
-- 方針で、保存自体を拒否する）、画面を開いても何もできない。鍵は環境ごとに別
-- （openssl rand -base64 32）。公開時:
--   ('app:ai-provider:main', true, 'AI プロバイダ 本番公開', now())

-- 通知メール（SY0F）は dev でダイジェストが期待どおりの量になるのを見てから
-- 本番公開する。**画面が無くてもダイジェスト自体は動く**（既定 = まとめて送る）
-- ので、公開は「管理者が間隔と即時種別を変えられるようにする」ためのもの。
-- 公開時:
--   ('app:notification-email:main', true, '通知メール 本番公開', now())

COMMIT;
