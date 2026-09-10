-- CI 専用の pg_cron スタブ。**本番には入らない**（CI ジョブでのみ流す）。
--
-- なぜ要るか: entrypoint.sh は pg_cron が preload されている DB でだけ
-- sql/*-cron.sql を流す。CI の postgres には pg_cron が無いので、これまで
-- 4 本まるごと素通りしていた — つまり cron ファイルの構文誤りや、消えた
-- テーブル・列への参照は CI を通り、**merge 後の db-migrate で初めて落ちた**
-- （#811 が防ぎたかった事故そのもの）。
--
-- ジョブ本体（$job$ … $job$）は pg_cron でも text として保存されるだけなので、
-- ここでも本番でも install 時には解析されない。このスタブが捕まえるのは
-- **本体の外側**（DDL・cron.job への参照・ファイル自身の構文）で、実際に
-- db-migrate を止めてきたのはそちら。
CREATE SCHEMA IF NOT EXISTS cron;

CREATE TABLE IF NOT EXISTS cron.job (
  jobid    bigserial PRIMARY KEY,
  jobname  text UNIQUE,
  schedule text,
  command  text
);

CREATE OR REPLACE FUNCTION cron.schedule(job_name text, schedule text, command text)
RETURNS bigint LANGUAGE sql AS $$
  INSERT INTO cron.job (jobname, schedule, command)
  VALUES (job_name, schedule, command)
  ON CONFLICT (jobname) DO UPDATE SET schedule = EXCLUDED.schedule, command = EXCLUDED.command
  RETURNING jobid;
$$;

CREATE OR REPLACE FUNCTION cron.unschedule(job_id bigint)
RETURNS boolean LANGUAGE sql AS $$
  DELETE FROM cron.job WHERE jobid = job_id RETURNING true;
$$;

CREATE OR REPLACE FUNCTION cron.unschedule(job_name text)
RETURNS boolean LANGUAGE sql AS $$
  DELETE FROM cron.job WHERE jobname = job_name RETURNING true;
$$;
