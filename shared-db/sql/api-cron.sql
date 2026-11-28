-- api-cron.sql — 外部 API（/api/v1）の掃除と保持期間。冪等 — 再実行可。
--
-- 前提: shared-db イメージに pg_cron が入っていること（kiosk-cron.sql と同じ）。
-- 適用は coolify/apps/db-migrate の entrypoint.sh が毎デプロイ流す。
-- **新しい sql/*-cron.sql を足したら entrypoint.sh にも足すこと** — 忘れると
-- ジョブが一生登録されず、テーブルだけが無限に伸びる（一番静かな失敗）。
--
-- ■ ここでの掃除は「判定」ではない
-- portal-cron.sql / security-cron.sql と同じ約束: トークンやクライアントが
-- 期限切れかどうかは、リクエストのたびにアプリ側が時刻式で判定する
-- （lib/api-auth-core.ts の apiAuthDecision）。cron が遅れても早まっても、
-- 実際に通るかどうかは 1 ミリ秒も変わらない。行を消すのは表が伸びないように
-- するためだけ。**この向きを逆にしてはいけない** — cron に失効させると、
-- 遅れがそのまま「まだ使える」になる。
--
-- ■ レート制限のカウンタはここに無い
-- app.portal_rate_limits を共用する（あの表は名前に反して「未認証の口の失敗
-- カウンタ」という一般の道具で、社内ログインの WEB_LOGIN_* も既に相乗りして
-- いる。bucket は VarChar なので種類を足すのに migration は要らない）。
-- 掃除は portal-cron.sql の portal_rate_limit_cleanup が面倒を見る。
--
-- ■ 期間を切ることは設計の一部
-- api_access_logs は「どの外部システムが、いつ、どこから、何を読んだか」と
-- 送信元 IP を持つ。「SY0I を権限で閉じる」「metabase_ro から剥がす
-- （sql/grants.sql）」「ここで期間を切る」の 3 点セットで初めて成立する。

CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 再実行時は既存ジョブを置き換える
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'api_token_retention';
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'api_idempotency_cleanup';
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'api_access_log_retention';
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'webhook_delivery_retention';

-- 失効・期限切れのトークンは 90 日残す。「そのトークンで誰が何を読んだか」を
-- api_access_logs から辿るとき、トークン行が先に消えていると
-- どの資格情報だったのか分からなくなるため（token_id に FK は張っていない）。
SELECT cron.schedule('api_token_retention', '55 18 * * *', $job$
  DELETE FROM app.api_client_tokens
   WHERE (revoked_at IS NOT NULL AND revoked_at < now() - interval '90 days')
      OR (revoked_at IS NULL AND expires_at IS NOT NULL
          AND expires_at < now() - interval '90 days')
$job$);

-- 400 日 — 失敗した認証の調査は 1 年前まで遡る（login_attempts の失敗側・
-- portal_access_logs と同じ長さ。年次監査を跨げる）。
SELECT cron.schedule('api_access_log_retention', '50 18 * * *', $job$
  DELETE FROM app.api_access_logs
   WHERE created_at < now() - interval '400 days'
$job$);

-- 冪等キーの窓は 24 時間。過ぎた行は次の再送を「新しい書き込み」にするので、
-- 残しておく意味が無い（増えるだけ）。刻みを細かくするのは、書き込みの多い
-- 環境で表が膨らむのを避けるため。
SELECT cron.schedule('api_idempotency_cleanup', '*/30 * * * *', $job$
  DELETE FROM app.api_idempotency_keys
   WHERE created_at < now() - interval '24 hours'
$job$);

-- 外向き Webhook の配送記録は 30 日。「あの注文の通知は届いたか」を問い合わせ
-- られる期間で、本文は業務データの写しなので長く持たない。送信待ち（PENDING）は
-- 消さない — 再試行の窓は最長でも 2 日で、それより古い PENDING は残骸だが、
-- 消すかどうかの判断はアプリ側（打ち切り処理）に任せ、cron は終わった行だけ刈る。
SELECT cron.schedule('webhook_delivery_retention', '45 18 * * *', $job$
  DELETE FROM app.webhook_deliveries
   WHERE status <> 'PENDING'
     AND created_at < now() - interval '30 days'
$job$);
