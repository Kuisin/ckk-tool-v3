-- 端末ごとの「メンテナンス退出 PIN をいつ受け取ったか」。
--
-- PIN の履歴（20260914090000_kiosk_unlock_pin_history）だけでは、**その端末が
-- どれを保持しているか**が決められない。端末は PIN をローカルに持ち
-- （PinSync → SharedPreferences）、取りに来られなかった間の更新は届いていない
-- からで、last_activity_at では代用できない — あれは WS/HTTP 全般の通信であって
-- PIN を取得できたこととは別物（未リンク・トークン切れなら 401 で取れず、
-- PinSync 以前の APK はそもそも要求しない）。
--
-- unlock_pin_rotated_at はそのとき渡した PIN の rotated_at（= system_settings の
-- updated_at）。app.kiosk_unlock_pins の同じ時刻の行を引けば、その端末がいま
-- 保持している PIN そのものが出る。
-- NULL = 一度も同期できていない → 端末はビルド時の既定値のまま。
--
-- 書き込むのは GET /api/kiosk/unlock-pin（nextjs-kiosk）。既存行は NULL で始まる
-- ＝「未同期」と正しく読める（同期済みだと嘘をつくより、分からないと言う方が安全）。

ALTER TABLE "app"."kiosk_devices"
  ADD COLUMN "unlock_pin_synced_at"  TIMESTAMPTZ(6),
  ADD COLUMN "unlock_pin_rotated_at" TIMESTAMPTZ(6);
