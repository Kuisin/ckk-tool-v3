-- security-cron.sql — 認証イベント（app.login_attempts）と端末台帳
-- （app.user_devices）の保持期間ジョブ。冪等 — 再実行可。
--
-- 前提: shared-db イメージに pg_cron が入っていること（kiosk-cron.sql と同じ）。
-- 適用は coolify/apps/db-migrate の entrypoint.sh が毎デプロイ流す。
-- **新しい sql/*-cron.sql を足したら entrypoint.sh にも足すこと** — 忘れると
-- ジョブが一生登録されず、テーブルだけが無限に伸びる（一番静かな失敗）。
--
-- ■ なぜ成功と失敗で期間が違うのか
--   成功 180 日 … 全社員分が毎日たまる一方、価値は短期（「いつもと違う端末で
--                 入った」の比較）。
--   失敗 400 日 … インシデント調査は 1 年前まで遡る。年次監査を跨げる長さにする。
--
-- ■ 期間を切ることは設計の一部
-- signals にはタイムゾーン・言語・ハードウェア構成が入り、従業員監視に隣接する。
-- 「SY0D を system 権限に閉じる」「metabase_ro から剥がす（sql/grants.sql）」
-- 「ここで期間を切る」の 3 点セットで初めて成立する。1 つでも外すなら設計から
-- 見直すこと。

CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 再実行時は既存ジョブを置き換える
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'login_attempt_retention';
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'user_device_retention';

-- 毎日 JST 3:10 = GMT 18:10（cron.timezone は GMT のため UTC で指定する）
SELECT cron.schedule('login_attempt_retention', '10 18 * * *', $job$
  DELETE FROM app.login_attempts
  WHERE (outcome = 'SUCCESS' AND created_at < now() - interval '180 days')
     OR (outcome = 'FAILURE' AND created_at < now() - interval '400 days')
$job$);

-- 400 日見かけない端末行は落とす（同じ端末が戻ってくれば再登録される）。
-- 認証イベント側は user_device_id が ON DELETE SET NULL なので、履歴は消えず
-- 端末への紐付けだけが外れる。
SELECT cron.schedule('user_device_retention', '20 18 * * *', $job$
  DELETE FROM app.user_devices
  WHERE last_seen_at < now() - interval '400 days'
$job$);
