-- kiosk-cron.sql — キオスクプレゼンスの pg_cron バックストップジョブ。
--
-- 前提: shared-db イメージに pg_cron が入っており（docker-compose/shared-db/
-- Dockerfile）、compose の command に shared_preload_libraries=pg_cron と
-- cron.database_name=ckk が設定済みであること。イメージ/コマンド変更の
-- 反映後に `pnpm cron:remote`（shared-db/）で適用する。冪等 — 再実行可。
--
-- ジョブ（毎分・postgres として DB ckk 内で実行）:
--   kiosk_offline_sweep       — kiosk アプリ全停止などで WS サーバーの遷移ログが
--                               書けないときのオフライン検知バックストップ。
--   kiosk_stale_session_sweep — HTTP リクエストが二度と来ずに死んだセッションの
--                               失効 + LOGOUT 履歴行。
--
-- 「5 minutes」は次と同値に保つこと（3 箇所目のコピー）:
--   nextjs-kiosk/src/lib/kiosk-auth-core.ts  ONLINE_WINDOW_MS / IDLE_TIMEOUT_MS
--   nextjs-web/src/lib/kiosk-admin.ts        KIOSK_ONLINE_WINDOW_MS
--
-- 通常運転では kiosk の WS サーバーが 30s ごとに接続中端末の last_activity_at を
-- 刻むため、接続中の端末がこのジョブで誤ってオフライン化されることはない。

CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 再実行時は既存ジョブを置き換える
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'kiosk_offline_sweep';
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'kiosk_stale_session_sweep';
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'kiosk_location_retention';

-- 位置ログの保持期間: 90 日（毎日 3:30 に削除。5 分間隔 × 端末数で増えるため）
SELECT cron.schedule('kiosk_location_retention', '30 3 * * *', $job$
  DELETE FROM app.kiosk_device_locations
  WHERE recorded_at < now() - interval '90 days'
$job$);

SELECT cron.schedule('kiosk_offline_sweep', '* * * * *', $job$
  INSERT INTO app.kiosk_device_logs (device_id, type, source)
  SELECT d.id, 'OFFLINE', 'pg_cron'
  FROM app.kiosk_devices d
  WHERE (d.last_activity_at IS NULL
         OR d.last_activity_at < now() - interval '5 minutes')
    AND COALESCE((
      SELECT l.type::text FROM app.kiosk_device_logs l
      WHERE l.device_id = d.id AND l.type IN ('ONLINE', 'OFFLINE')
      ORDER BY l.id DESC
      LIMIT 1
    ), 'OFFLINE') = 'ONLINE'
$job$);

SELECT cron.schedule('kiosk_stale_session_sweep', '* * * * *', $job$
  WITH stale AS (
    UPDATE app.kiosk_sessions s SET revoked_at = now()
    WHERE s.revoked_at IS NULL
      AND (s.expires_at <= now()
           OR s.last_activity_at <= now() - interval '5 minutes')
    RETURNING s.device_id, s.user_id
  )
  INSERT INTO app.kiosk_device_logs (device_id, type, user_id, source)
  SELECT device_id, 'LOGOUT', user_id, 'pg_cron' FROM stale
$job$);
