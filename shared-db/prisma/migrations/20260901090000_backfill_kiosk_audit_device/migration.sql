-- 既存の操作履歴にキオスク端末を後付けする（kiosk_device_id の backfill）。
--
-- キオスク由来の行は、キオスクが書くメモの末尾が必ず「（キオスク）」なので
-- それで特定できる（lib/step-execution.ts / step-records.ts）。Web 由来の
-- work_orders 更新はタグが無いので対象外。
--
-- どの端末かは **端末ログ（kiosk_device_logs）の直近 LOGIN** で推定する
-- — 操作時点で最後にその利用者がログインした端末。記録当時は端末を保存して
-- いなかったため、これは事後推定であって厳密な証跡ではない（複数端末に同時
-- ログインしていた時間帯は最後の LOGIN を採用する）。
-- 推定できない行は、運用実態に合わせて Demo Tablet に寄せる。
--
-- 冪等: kiosk_device_id が既に入っている行は触らない。

UPDATE "app"."audit_logs" a
SET "kiosk_device_id" = COALESCE(
  (
    SELECT l."device_id"
      FROM "app"."kiosk_device_logs" l
     WHERE l."type" = 'LOGIN'
       AND l."user_id" = a."user_id"
       AND l."created_at" <= a."created_at"
     ORDER BY l."created_at" DESC
     LIMIT 1
  ),
  -- 端末ログが無い時期の行は既定でデモ端末（当時の主な検証端末）。
  (
    SELECT d."id"
      FROM "app"."kiosk_devices" d
     WHERE d."name"->>'ja' = 'Demo Tablet'
     LIMIT 1
  )
)
WHERE a."kiosk_device_id" IS NULL
  AND a."after_data"->>'note' LIKE '%（キオスク）%';
