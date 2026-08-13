-- QRカードの同時ログイン上限（既定 1 台）。超過分はログイン時に最終活動が
-- 最も古いセッションから失効させる（キオスク側 createSession が enforce）。
ALTER TABLE "app"."kiosk_cards"
  ADD COLUMN "max_active_sessions" INTEGER NOT NULL DEFAULT 1;
