-- 多態参照「法人コード/番号」（20261126210000_doc_company_refs）の DB 側の試験。
-- 番号設計 PR-D（20261126280000_numbering_cleanup）で、番号だけの値を保存時に
-- 参照へ直していたトリガー（qualify_doc_ref / qualify_audit_record_key）は落とした
-- — 書き手（アプリ・共有端末・シード）は自分で参照（doc_ref）を書く。残るのは
-- 参照を**引く**ための関数（app.to_doc_ref / app.resolve_doc_ref）と、書類を
-- 消したときの子の掃除。
--
-- document-sequences.sql と同じく、まっさらな DB に migrate deploy した直後に
-- `ON_ERROR_STOP=1` で流す。全体を 1 トランザクションにして最後に ROLLBACK する。

BEGIN;

DO $$
DECLARE
  v_default int;
  v_other   int;
  v_code    text;
  a1 app.order_acceptances%ROWTYPE;
  a2 app.order_acceptances%ROWTYPE;
  v_file uuid;
  v_id text;
  n  int;
BEGIN
  SELECT id, code INTO v_default, v_code FROM app.own_companies WHERE is_default;
  INSERT INTO app.own_companies (code, name, updated_at)
  VALUES ('ZZT', '{"ja":"試験法人"}', now()) RETURNING id INTO v_other;

  -- ── 形の判定 ────────────────────────────────────────────────────────────
  ASSERT app.is_doc_number('QOT-202607-00001'), 'doc number';
  ASSERT app.is_doc_number('QOT-2026-00001'), 'fiscal-year number';
  ASSERT app.is_doc_number('ORD-202607-00001-02'), 'order line number';
  ASSERT NOT app.is_doc_number('4711'), 'lot number is not a doc number';
  ASSERT NOT app.is_doc_number('3f2b8c1e-0d4a-4f6b-9a57-1c2d3e4f5a6b'), 'uuid';
  ASSERT NOT app.is_doc_number('CKK/QOT-202607-00001'), 'a ref is not a bare number';

  ASSERT app.doc_ref_table('invoice_payments') = 'invoices', 'alias type';
  ASSERT app.doc_ref_table('work_orders') IS NULL, 'work orders are not refs';

  -- ── 書類の法人で参照を作る ──────────────────────────────────────────────
  -- 旧番号（legacy_number）付きで入れる — 引く関数が旧番号でも当たることを見る
  INSERT INTO app.order_acceptances (legacy_number, updated_at)
  VALUES ('ORD-209901-00001', now()) RETURNING * INTO a1;
  INSERT INTO app.order_acceptances (legacy_number, own_company_id, updated_at)
  VALUES ('ORD-209901-00002', v_other, now()) RETURNING * INTO a2;

  ASSERT app.to_doc_ref('order_acceptances', 'ORD-209901-00001') = a1.doc_ref,
    'ref uses the document company (default)';
  ASSERT app.to_doc_ref('order_acceptances', 'ORD-209901-00002') = a2.doc_ref,
    'ref uses the document company (other)';
  -- 既に参照 / 番号の形でない / 対象外の type はそのまま
  ASSERT app.to_doc_ref('order_acceptances', a2.doc_ref) = a2.doc_ref, 'idempotent';
  -- 法人コード付きの旧番号も、その法人の書類の新しい参照へ（番号設計 PR-C）
  ASSERT app.to_doc_ref('order_acceptances', 'ZZT/ORD-209901-00002') = a2.doc_ref,
    'a qualified legacy number maps to the new ref';
  ASSERT a2.doc_ref ~ '^ZZT/ORD-[0-9]{4}-00001$', 'new ref carries the document company';
  ASSERT app.to_doc_ref('order_lines', '3f2b8c1e-0d4a-4f6b-9a57-1c2d3e4f5a6b')
       = '3f2b8c1e-0d4a-4f6b-9a57-1c2d3e4f5a6b', 'uuid stays';
  ASSERT app.to_doc_ref('work_orders', '4711') = '4711', 'lot number stays';
  -- 書類が無ければ既定の法人（番号だけを残さない）
  ASSERT app.to_doc_ref('order_acceptances', 'ORD-209901-00099') = v_code || '/ORD-209901-00099',
    'missing document falls back to the default company';

  -- ── 保存時に書き換えない（番号だけの値を直すトリガーは無い）─────────────
  SELECT count(*) INTO n FROM pg_trigger
   WHERE tgname IN ('qualify_doc_ref', 'qualify_audit_record_key', 'rewrite_legacy_doc_refs',
                    'rewrite_legacy_line_refs') AND NOT tgisinternal;
  ASSERT n = 0, format('legacy compat triggers are gone (%s left)', n);

  -- 参照は書き手が組み立てて書く（アプリは lib/doc-ref の requireDocRef）
  INSERT INTO app.approval_requests (target_type, target_id, step_no, step_count, flow_snapshot)
  VALUES ('order_acceptances', a2.doc_ref, 1, 1, '[]')
  RETURNING target_id INTO v_id;
  ASSERT v_id = a2.doc_ref, 'approval target is stored as written';

  INSERT INTO app.document_memos (owner_type, owner_id, kind, content, plain_text, updated_at)
  VALUES ('order_acceptances', app.to_doc_ref('order_acceptances', 'ORD-209901-00002'), 'MEMO', '{}', '', now())
  RETURNING owner_id INTO v_id;
  ASSERT v_id = a2.doc_ref, 'a ref looked up from the legacy number';

  INSERT INTO app.files (storage_key, filename, mime_type)
  VALUES ('t/doc-refs', 't.pdf', 'application/pdf') RETURNING id INTO v_file;
  INSERT INTO app.document_attachments (owner_type, owner_id, file_id)
  VALUES ('order_acceptances', a1.doc_ref, v_file)
  RETURNING owner_id INTO v_id;
  ASSERT v_id = a1.doc_ref, 'attachment owner';

  INSERT INTO app.inventory_movements (cause, source_type, source_id)
  VALUES ('MANUAL', 'order_acceptances', a2.doc_ref)
  RETURNING source_id INTO v_id;
  ASSERT v_id = a2.doc_ref, 'movement source';

  -- 番号を持たない表の監査キーはそのまま
  INSERT INTO app.audit_logs (action, table_name, record_id, record_key)
  VALUES ('UPDATE', 'plants', '1', '1')
  RETURNING record_key INTO v_id;
  ASSERT v_id = '1', 'other audit keys are untouched';

  -- ── 削除で子を掃除する（その法人の参照だけ）──────────────────────────────
  -- 同じ番号の文字列を別の法人の参照として置いておく — 巻き込まれないこと。
  INSERT INTO app.document_memos (owner_type, owner_id, kind, content, plain_text, updated_at)
  VALUES ('order_acceptances', 'OTHER/ORD-209901-00002', 'MEMO', '{}', '', now());

  DELETE FROM app.order_acceptances WHERE id = a2.id;

  SELECT count(*) INTO n FROM app.approval_requests
   WHERE target_type = 'order_acceptances' AND target_id = a2.doc_ref;
  ASSERT n = 0, 'approval requests of the deleted document are purged';
  SELECT count(*) INTO n FROM app.document_memos
   WHERE owner_type = 'order_acceptances' AND owner_id = a2.doc_ref;
  ASSERT n = 0, 'memos of the deleted document are purged';
  SELECT count(*) INTO n FROM app.document_memos
   WHERE owner_type = 'order_acceptances' AND owner_id = 'OTHER/ORD-209901-00002';
  ASSERT n = 1, 'the same number in another company is left alone';
  SELECT count(*) INTO n FROM app.document_attachments
   WHERE owner_type = 'order_acceptances' AND owner_id = a1.doc_ref;
  ASSERT n = 1, 'other documents keep their children';

  -- 納品書にも掃除のトリガーがある
  SELECT count(*) INTO n FROM pg_trigger
   WHERE tgrelid = 'app.delivery_notes'::regclass AND tgname = 'purge_children_after_delete';
  ASSERT n = 1, 'delivery_notes has the purge trigger';
END $$;

ROLLBACK;
