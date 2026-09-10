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
-- ■ 期間を切ることは設計の一部
-- api_access_logs は「どの外部システムが、いつ、どこから、何を読んだか」と
-- 送信元 IP を持つ。「SY0I を権限で閉じる」「metabase_ro から剥がす
-- （sql/grants.sql）」「ここで期間を切る」の 3 点セットで初めて成立する。

CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 再実行時は既存ジョブを置き換える
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'api_rate_limit_cleanup';
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'api_token_retention';
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'api_access_log_retention';

-- レート制限のカウンタ。窓もロックも最長 1 時間なので、7 日見かけない行は捨てる。
-- **ロック中の行は消さない** — 消すとロックが解けてしまう。
SELECT cron.schedule('api_rate_limit_cleanup', '45 18 * * *', $job$
  DELETE FROM app.api_rate_limits
   WHERE updated_at < now() - interval '7 days'
     AND (locked_until IS NULL OR locked_until < now())
$job$);

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
