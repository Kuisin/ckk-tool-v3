-- 添付のシステムロック。
--
-- 取込元の原本（受注請書の元 PDF・画像）は、あとから内容を確かめる唯一の
-- 根拠なので消させない。is_locked = true の添付は削除・差し替えを拒否する
-- （アプリ側 lib/attachments.ts でも弾く）。
ALTER TABLE app.document_attachments
  ADD COLUMN IF NOT EXISTS is_locked boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN app.document_attachments.is_locked IS
  'システムが付けた添付（取込元の原本など）。削除・差し替え不可。';

-- 既存の受注請書の取込元ファイルを、ロック付き添付として登録する（後追い）。
-- 二重登録を避けるため、同じ owner + file の行が無いものだけ入れる。
INSERT INTO app.document_attachments (owner_type, owner_id, file_id, label, uploaded_by, is_locked, created_at)
SELECT
  'order_acceptances',
  'ORD-' || oa.year_month || '-' || lpad(oa.seq::text, 5, '0'),
  oa.source_file_id,
  '取込元（原本）',
  oa.created_by,
  true,
  oa.created_at
FROM app.order_acceptances oa
WHERE oa.source_file_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM app.document_attachments a
    WHERE a.owner_type = 'order_acceptances'
      AND a.owner_id = 'ORD-' || oa.year_month || '-' || lpad(oa.seq::text, 5, '0')
      AND a.file_id = oa.source_file_id
  );
