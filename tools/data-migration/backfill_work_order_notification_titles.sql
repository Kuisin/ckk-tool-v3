-- backfill_work_order_notification_titles.sql — 通知の件名を「ロット番号」から
-- 「指示書の書類番号（WOR-YYYYMM-NNNNN）」へ書き直す一回限りのデータ補正。
--
-- 背景（fix/notification-doc-numbers, PR #829）: 承認依頼・承認結果・外注入荷の
-- 通知は、以前は指示書の**業務キー**（QR・監査・kiosk が使うロット番号の生の
-- 整数）をそのまま件名に載せていた。指示書だけ業務キーと画面の表示番号が別物
-- （structure.md）なので、「指示書 8 の第一承認依頼」のような裸の数字が出て
-- いた。コードは直したが、`app.notifications.title` は生成時点の文字列を
-- そのまま保存する列（読み出し時に再レンダリングしない）ので、修正**前**に
-- 作られた通知行はコードを直しても自動では変わらない。これはその行だけを
-- 狙って書き直す一回限りの補正。
--
-- 対象は 3 言語 × 2 パターン（{doc} {targetId} / {doc} #{workOrderNumber}）
-- ×「指示書 / Work order / 工单」の組み合わせ。すでに書類番号（WOR-…）に
-- なっている行は正規表現がそもそもマッチしないので、二回流しても安全（冪等）。
-- 対象の work_orders 行が見つからない（ロット番号が採番リセット等で失われた）
-- 場合は JOIN が落ちるだけで、その行は元のまま残る。
--
-- 適用: shared-db/ から
--   pnpm remote psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f ../tools/data-migration/backfill_work_order_notification_titles.sql
--
-- 先に対象行を確認したいときは、下の SELECT 部分（BEGIN/COMMIT の外）だけを
-- 別途実行してもよい。

BEGIN;

WITH candidates AS (
  SELECT
    n.id,
    n.title,
    (regexp_match(n.title, '(指示書|Work order|工单)\s*#?([0-9]+)'))[1] AS doc_label,
    (regexp_match(n.title, '(指示書|Work order|工单)\s*#?([0-9]+)'))[2] AS wo_number_text
  FROM app.notifications n
  WHERE n.type IN ('APPROVAL_REQUEST', 'APPROVAL_RESULT', 'SYSTEM')
    AND n.title ~ '(指示書|Work order|工单)\s*#?[0-9]+'
),
resolved AS (
  SELECT
    c.id,
    c.doc_label,
    c.wo_number_text,
    wo.year_month,
    wo.seq
  FROM candidates c
  JOIN app.work_orders wo
    ON wo.work_order_number = c.wo_number_text::int
)
UPDATE app.notifications n
SET title = regexp_replace(
  n.title,
  '(指示書|Work order|工单)\s*#?' || r.wo_number_text || '(?![0-9])',
  r.doc_label || ' WOR-' || r.year_month || '-' || lpad(r.seq::text, 5, '0')
)
FROM resolved r
WHERE n.id = r.id;

COMMIT;
