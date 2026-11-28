-- 手動入出庫（ST06）の事由を足す。
--
-- 向きに応じて ADJUSTMENT / STOCK_TRANSFER に振り分けることもできたが、それは嘘。
-- ADJUSTMENT は棚卸が数え直した結果、STOCK_TRANSFER は在庫移動画面が起こすもので、
-- 手で入れた入出庫をそこへ混ぜると「棚卸で合わせた分」と「人が足した分」が
-- 後から区別できなくなる。業務としてどの型かは movement_type_id が持つ。
--
-- 値を**増やす**だけなので旧アプリは壊れない（読まない値が増えるだけ）。
ALTER TYPE "app"."INVENTORY_MOVEMENT_CAUSE" ADD VALUE IF NOT EXISTS 'MANUAL';
