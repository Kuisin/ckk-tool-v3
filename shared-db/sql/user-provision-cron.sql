-- user-provision-cron.sql — AD の従業員から app.users を毎日つくる（**本番のみ**）。
--
-- なぜ要るか: これまでアプリのユーザー行は「本人が初めて SSO ログインした瞬間」に
-- しか作られなかった（auth.ts の signIn コールバック）。そのため未ログインの人は
-- 承認者に指名できない・担当に割り当てられない、という順序の問題があった。
-- 先に行を作っておけば、初回ログインは既存行の last_login_at 更新になるだけ。
--
-- 入力は `directory.employee_directory`（Samba AD → ldap-sync）。
-- **Authentik ではない** — Authentik は AD に対して認証を中継するだけで、
-- 自分のところに従業員のユーザーオブジェクトを持っていない（akadmin と
-- outpost のサービスアカウントの 2 件しか居ない）。ログイン時に Authentik が
-- 渡してくる preferred_username は AD の username と同じなので、ここで作る行と
-- 初回ログインの行は同じ username で一致する（重複しない）。
--
-- 対象は **department が入っている有効な行**だけ。AD には ANCA1..ANCA14 のような
-- 機械アカウントや、部署の無いサービス行が混ざっているため。
--
-- 適用は `db-migrate-main` のみ（entrypoint が USER_PROVISION_CRON=1 のときだけ
-- 流す）。dev の DB にユーザーを量産しても意味が無いので入れない。
-- 冪等 — 再実行するとジョブ定義を置き換えるだけ。

CREATE EXTENSION IF NOT EXISTS pg_cron;

-- ── provisioning 本体 ───────────────────────────────────────────────────────
-- 関数にしておくと、cron から呼ぶのと手で流すのとで同じ経路になる。
CREATE OR REPLACE FUNCTION app.provision_users_from_directory()
RETURNS TABLE(created integer, refreshed integer)
LANGUAGE plpgsql
AS $$
DECLARE
  v_created  integer := 0;
  v_refreshed integer := 0;
BEGIN
  -- 新規作成。employee_id を AD の ldap_guid に結び付けておく（プロフィール表示が
  -- 所属・役職を引けるようになる。アプリ側は今のところこの列を書かない）。
  WITH src AS (
    SELECT ed.username,
           coalesce(nullif(ed.display_name, ''), ed.username) AS display_name,
           nullif(ed.email, '')                               AS email,
           ed.ldap_guid
      FROM directory.employee_directory ed
     WHERE ed.is_active IS TRUE
       AND ed.department IS NOT NULL
       AND ed.username IS NOT NULL
  ), ins AS (
    INSERT INTO app.users
      (id, "group", username, display_name, email, employee_id,
       is_active, created_at, updated_at)
    SELECT gen_random_uuid(), 'EMPLOYEE', s.username, s.display_name, s.email,
           s.ldap_guid, true, now(), now()
      FROM src s
    ON CONFLICT (username) DO NOTHING
    RETURNING 1
  )
  SELECT count(*)::integer INTO v_created FROM ins;

  -- 既存行は AD 由来の属性だけ追従させる。
  -- is_active / group / password_hash / ロールには触らない — アプリ側で無効に
  -- した人を AD が有効だからと勝手に戻さないため。
  WITH src AS (
    SELECT ed.username,
           coalesce(nullif(ed.display_name, ''), ed.username) AS display_name,
           nullif(ed.email, '')                               AS email,
           ed.ldap_guid
      FROM directory.employee_directory ed
     WHERE ed.is_active IS TRUE
       AND ed.department IS NOT NULL
       AND ed.username IS NOT NULL
  ), upd AS (
    UPDATE app.users u
       SET display_name = s.display_name,
           email        = coalesce(s.email, u.email),
           -- 既に別の行が同じ guid を持っていたら触らない（employee_id は unique）
           employee_id  = CASE
                            WHEN u.employee_id IS DISTINCT FROM s.ldap_guid
                             AND NOT EXISTS (SELECT 1 FROM app.users x
                                              WHERE x.employee_id = s.ldap_guid
                                                AND x.id <> u.id)
                            THEN s.ldap_guid ELSE u.employee_id END,
           updated_at   = now()
      FROM src s
     WHERE u.username = s.username
       AND (u.display_name IS DISTINCT FROM s.display_name
            OR (s.email IS NOT NULL AND u.email IS DISTINCT FROM s.email)
            OR u.employee_id IS DISTINCT FROM s.ldap_guid)
    RETURNING 1
  )
  SELECT count(*)::integer INTO v_refreshed FROM upd;

  RAISE NOTICE 'provision_users_from_directory: created=% refreshed=%',
    v_created, v_refreshed;
  RETURN QUERY SELECT v_created, v_refreshed;
END;
$$;

COMMENT ON FUNCTION app.provision_users_from_directory() IS
  'AD（directory.employee_directory）から app.users を作成・属性追従。毎日 02:00 JST に pg_cron が実行';

-- ── スケジュール ────────────────────────────────────────────────────────────
-- cron.timezone は GMT なので UTC で書く（JST 2:00 = GMT 17:00）。
-- 既存ジョブ（kiosk_*）と同じ流儀。
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'provision_users_from_directory';

SELECT cron.schedule('provision_users_from_directory', '0 17 * * *', $job$
  SELECT app.provision_users_from_directory();
$job$);
