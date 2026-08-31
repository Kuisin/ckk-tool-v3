-- portal-cron.sql — 取引先ポータル（社外向け）の掃除と保持期間。冪等 — 再実行可。
--
-- 前提: shared-db イメージに pg_cron が入っていること（kiosk-cron.sql と同じ）。
-- 適用は coolify/apps/db-migrate の entrypoint.sh が毎デプロイ流す。
-- **新しい sql/*-cron.sql を足したら entrypoint.sh にも足すこと** — 忘れると
-- ジョブが一生登録されず、テーブルだけが無限に伸びる（一番静かな失敗）。
--
-- ■ ここでの掃除は「判定」ではない
-- security-cron.sql の特権アクセスと同じ約束: 期限切れかどうかはアプリ側が
-- 毎回その場で時刻式で判定する（lib/portal-auth-core.ts の isPortalSessionAlive、
-- リンクとチャレンジは解決時の WHERE 句）。cron が遅れても早まっても、
-- 実際に使えるかどうかは 1 ミリ秒も変わらない。行を消すのは表が伸びないように
-- するためだけ。
--
-- ■ 期間を切ることは設計の一部
-- portal_access_logs は社外の個人が「いつ何を見たか」と送信元 IP を持つ。
-- 「SY0H を権限で閉じる」「metabase_ro から剥がす（sql/grants.sql）」
-- 「ここで期間を切る」の 3 点セットで初めて成立する（login_attempts と同じ）。

CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 再実行時は既存ジョブを置き換える
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'portal_challenge_cleanup';
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'portal_session_cleanup';
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'portal_rate_limit_cleanup';
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'portal_link_retention';
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'portal_access_log_retention';

-- ─── 生きた資格情報の残骸（短命）──────────────────────────────────────────
--
-- OTP チャレンジは 10 分で切れる。1 時間残すのは、直後の問い合わせ
-- （「コードが通らない」）を SY0H で追えるようにするため。アプリ側も発行時に
-- 期限切れ行を deleteMany するので、これは取りこぼしの受け皿。
SELECT cron.schedule('portal_challenge_cleanup', '*/15 * * * *', $job$
  DELETE FROM app.portal_login_challenges
   WHERE expires_at < now() - interval '1 hour'
$job$);

-- セッションはハード期限 7 日。切れて 1 日たった行は残す意味が無い
-- （「誰がいつ入ったか」は login_attempts と portal_access_logs が持つ）。
SELECT cron.schedule('portal_session_cleanup', '5 18 * * *', $job$
  DELETE FROM app.portal_sessions
   WHERE expires_at < now() - interval '1 day'
$job$);

-- レート制限のカウンタ。窓もロックも最長 1 時間なので、7 日見かけない行は捨てる。
-- **ロック中の行は消さない** — 消すとロックが解けてしまう。
SELECT cron.schedule('portal_rate_limit_cleanup', '15 18 * * *', $job$
  DELETE FROM app.portal_rate_limits
   WHERE updated_at < now() - interval '7 days'
     AND (locked_until IS NULL OR locked_until < now())
$job$);

-- ─── 履歴（長命）──────────────────────────────────────────────────────────
--
-- 失効・期限切れのリンクは 90 日残す。「そのリンクで誰が何を見たか」を
-- portal_access_logs から辿るとき、リンク行が先に消えていると誰に渡した
-- ものか分からなくなるため（link_id は ON DELETE SET NULL）。
SELECT cron.schedule('portal_link_retention', '25 18 * * *', $job$
  DELETE FROM app.portal_document_links
   WHERE expires_at < now() - interval '90 days'
     AND (revoked_at IS NULL OR revoked_at < now() - interval '90 days')
$job$);

-- 社外からの閲覧記録。保持期間は login_attempts の失敗側と同じ 400 日
-- （インシデント調査が年次監査を跨げる長さ）。
SELECT cron.schedule('portal_access_log_retention', '35 18 * * *', $job$
  DELETE FROM app.portal_access_logs
   WHERE created_at < now() - interval '400 days'
$job$);
