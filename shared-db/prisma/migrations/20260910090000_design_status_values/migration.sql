-- 設計依頼書 (SA06) に承認フローを入れる — その 1: DESIGN_STATUS へ値を足すだけ。
--
-- ⚠️ このリポジトリで初めての ALTER TYPE ... ADD VALUE。
-- PostgreSQL 17 はトランザクション内での値追加を許すが、**同じトランザクションの
-- 中では追加した値をまだ使えない**（DEFAULT の張り替え・UPDATE など）。
-- そのため「値を足す」だけをこのファイルに閉じ、「値を使う」側は次の
-- migration（= prisma migrate deploy が別トランザクションで流す）に置いている。
-- この 2 ファイルを 1 つにまとめないこと。
--
-- 既存行の移行は不要 — PENDING は「未着手」から「承認済・着手待ち」へ意味を
-- 引き継ぐだけで、どちらも「これから着手できる」状態を指す。

ALTER TYPE app."DESIGN_STATUS" ADD VALUE IF NOT EXISTS 'DRAFT' BEFORE 'PENDING';
ALTER TYPE app."DESIGN_STATUS" ADD VALUE IF NOT EXISTS 'REQUESTED' BEFORE 'PENDING';
ALTER TYPE app."DESIGN_STATUS" ADD VALUE IF NOT EXISTS 'REJECTED' AFTER 'COMPLETED';
ALTER TYPE app."DESIGN_STATUS" ADD VALUE IF NOT EXISTS 'CANCELLED' AFTER 'REJECTED';
