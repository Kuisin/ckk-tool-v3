-- 指示書の書類番号プレフィクスを WO → WOR に変更（表示は WOR-YYYYMM-NNNNN）。
-- 番号本体（year_month + seq）は導出表示なので、変わるのは
-- numbering_sequences の prefix 列（記録用 — アプリは読み返さない）だけ。
UPDATE "app"."numbering_sequences"
SET "prefix" = 'WOR', "updated_at" = now()
WHERE "key" = 'WORK_ORDER_DOC';
