-- user-suspension-cron.sql — 一時停止したユーザーを期限で自動復帰させる。
--
-- 前提: pg_cron が preload 済み（kiosk-cron.sql と同じ条件）。冪等 — 再実行可。
-- マイグレーションではなく「毎回流し直す成果物」側に置いてあるのは、
-- grants / kiosk-cron / analytics-views と同じ理由（スケジュールは環境の状態で
-- あって、履歴として一度だけ適用するものではない）。
--
-- 判定を SQL 式（is_active AND disabled_until <= now()）にせずフラグを戻す設計に
-- した理由は migration 20260901090000_user_suspension のコメントを参照。
-- 副作用として、復帰は**最大 1 分遅れる**。停止は即時なので、危険側には倒れない。

CREATE EXTENSION IF NOT EXISTS pg_cron;

CREATE OR REPLACE FUNCTION app.restore_expired_user_suspensions()
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  restored integer;
BEGIN
  WITH done AS (
    UPDATE app.users
       SET is_active       = true,
           disabled_until  = NULL,
           disabled_reason = NULL,
           disabled_at     = NULL,
           disabled_by     = NULL,
           updated_at      = now()
     WHERE is_active = false
       AND disabled_until IS NOT NULL
       AND disabled_until <= now()
    RETURNING id
  )
  SELECT count(*) INTO restored FROM done;
  RETURN restored;
END;
$$;

COMMENT ON FUNCTION app.restore_expired_user_suspensions() IS
  '一時停止の期限が来たユーザーを有効へ戻す（SY01 の一時停止用・毎分実行）';

-- 既存ジョブがあれば作り直す（冪等）。
SELECT cron.unschedule(jobid)
  FROM cron.job
 WHERE jobname = 'restore_expired_user_suspensions';

SELECT cron.schedule(
  'restore_expired_user_suspensions',
  '* * * * *',
  $$SELECT app.restore_expired_user_suspensions()$$
);

SELECT jobname, schedule FROM cron.job WHERE jobname = 'restore_expired_user_suspensions';
