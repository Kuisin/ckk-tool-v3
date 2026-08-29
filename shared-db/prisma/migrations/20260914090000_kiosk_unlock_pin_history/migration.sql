-- キオスク メンテナンス退出 PIN の履歴表。
--
-- 現行値は system_settings['kiosk.unlock_pin'] の 1 行で、pg_cron が毎日 4:00 に
-- 上書きする。上書きなので旧値は残らず、オフラインの端末（PIN をローカルに
-- 持っている）を開けたいときに必要な「最後に同期できた時点の値」が引けなかった。
-- この表はその 1 行を残すためだけにある。
--
-- 書き込むのは kiosk-cron.sql の kiosk_unlock_pin_rotate ジョブ（migration では
-- ないので、このファイルとは別に毎デプロイ再適用される）。ここでは表を作り、
-- **今の現行値を 1 行目として入れておく**（履歴が空のまま始まると、次の 4:00
-- までに端末が落ちた場合に穴が開く）。
--
-- 保持期間 400 日の刈り取りは cron 側が行う。

CREATE TABLE "app"."kiosk_unlock_pins" (
  "id"         BIGSERIAL      NOT NULL,
  "pin"        VARCHAR(8)     NOT NULL,
  "rotated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "source"     VARCHAR(16)    NOT NULL DEFAULT 'pg_cron',

  CONSTRAINT "kiosk_unlock_pins_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "kiosk_unlock_pins_rotated_at_idx"
  ON "app"."kiosk_unlock_pins" ("rotated_at");

-- 現行値を履歴の 1 行目として取り込む（値が無い環境では何もしない）。
-- rotated_at は system_settings.updated_at = 最後に回った時刻を使う。
INSERT INTO "app"."kiosk_unlock_pins" ("pin", "rotated_at", "source")
SELECT s.value #>> '{}', s.updated_at, 'migration'
FROM "app"."system_settings" s
WHERE s.key = 'kiosk.unlock_pin'
  AND jsonb_typeof(s.value) = 'string'
  AND length(s.value #>> '{}') BETWEEN 4 AND 8;
