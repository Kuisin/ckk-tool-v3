-- kiosk-cron.sql — キオスクプレゼンスの pg_cron バックストップジョブ。
--
-- 前提: shared-db イメージに pg_cron が入っており（coolify/common/shared-db/
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
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'kiosk_unlock_pin_rotate';

-- メンテナンス退出 PIN（全端末共通）を毎日 4:00 に自動更新。
-- SY09 端末詳細で確認（表示は監査ログ記録）。端末アプリ（v0.5.3+）は
-- /api/kiosk/unlock-pin から 1 時間ごと + ダイアログ表示時に同期する。
-- （JST 4:00 = GMT 19:00）
--
-- 現行値の更新は上書きなので、**同じジョブで履歴（app.kiosk_unlock_pins）へも
-- 1 行残す**。端末は PIN をローカルに持っており（PinSync → SharedPreferences）、
-- オフラインの端末が受け付けるのは「最後に同期できた時点の値」= 上書きで
-- 消えた値だから。ここを落とすと、回線の切れた端末を開ける手段が
-- バックアップからの復元しか無くなる。
--
-- 履歴の rotated_at は system_settings.updated_at と同じ値を入れる
-- （「この時刻に有効だった PIN」を 1 本の物差しで引けるようにするため）。
-- 保持期間 400 日 — login_attempts の失敗行と同じ既定。1 日 1 行なので容量は
-- 問題にならない。刈り取りはこのジョブの本体（最後の DELETE）。
SELECT cron.schedule('kiosk_unlock_pin_rotate', '0 19 * * *', $job$
  WITH rotated AS (
    INSERT INTO app.system_settings (key, value, description, updated_at)
    VALUES ('kiosk.unlock_pin',
            to_jsonb(lpad(floor(random() * 1000000)::text, 6, '0')),
            'キオスク メンテナンス退出 PIN（毎日 4:00 自動更新・全端末共通）',
            now())
    ON CONFLICT (key) DO UPDATE
      SET value = EXCLUDED.value, description = EXCLUDED.description, updated_at = now()
    RETURNING value #>> '{}' AS pin, updated_at
  ),
  -- WITH 内の更新文は参照されなくても必ず実行される（Postgres の仕様）
  history AS (
    INSERT INTO app.kiosk_unlock_pins (pin, rotated_at, source)
    SELECT pin, updated_at, 'pg_cron' FROM rotated
  )
  DELETE FROM app.kiosk_unlock_pins
  WHERE rotated_at < now() - interval '400 days'
$job$);

-- 位置ログの保持期間: 90 日（毎日 JST 3:30 = GMT 18:30 に削除。
-- cron.timezone は GMT のため UTC で指定する）
SELECT cron.schedule('kiosk_location_retention', '30 18 * * *', $job$
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
