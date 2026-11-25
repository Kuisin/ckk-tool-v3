-- 書類番号の採番（20261126230000_document_numbering）の DB 側の試験。
--
-- ほかの sql-tests と同じく、まっさらな DB に migrate deploy した直後に
-- `ON_ERROR_STOP=1` で流す。全体を 1 トランザクションにして最後に ROLLBACK する。
--
-- 見ているもの:
--   1. 番号は DB が払い出す（呼び出し側の値は上書き）。法人ごと・年度ごとに 00001 から
--   2. 年度は起票日時の**日本時間の暦日**で決まる
--   3. 保存が巻き戻れば番号も戻る（欠番なし）
--   4. 払い出した番号は変えられない / 形の合わない番号は入らない
--   5. 注文明細番号は注文請書の番号 + 枝番
--   6. 旧番号（legacy_number）を付けて入れた書類は旧番号を保ったまま新しい番号を
--      受け取り、旧番号から参照を引ける（app.to_doc_ref / app.resolve_doc_ref）
--   7. 外注依頼の番号は、外注工程に依頼日が入った時点で 1 回だけ払い出される
--   8. 振り直し（app.renumber_documents）は、起票日時の順に 1 件ずつ作ったときと
--      同じ番号を出す

BEGIN;

DO $$
DECLARE
  v_default int;
  v_code    text;
  v_other   int;
  a  app.order_acceptances%ROWTYPE;
  b  app.order_acceptances%ROWTYPE;
  c  app.order_acceptances%ROWTYPE;
  l  app.order_lines%ROWTYPE;
  w  app.work_orders%ROWTYPE;
  v_item int;
  v_step uuid;
  v_step_cat int;
  v_id text;
  n int;
  failed boolean;
  v_before text[];
  v_after  text[];
BEGIN
  SELECT id, code INTO v_default, v_code FROM app.own_companies WHERE is_default;
  INSERT INTO app.own_companies (code, name, updated_at)
  VALUES ('ZZT', '{"ja":"試験法人"}', now()) RETURNING id INTO v_other;

  -- ── 1. 法人ごと・年度ごとの連番。呼び出し側の値は上書き ────────────────
  INSERT INTO app.order_acceptances (created_at, updated_at, fiscal_year, doc_seq, doc_number, doc_ref)
  VALUES ('2030-06-01 03:00:00+00', now(), 1999, 77, 'ORD-1999-00077', 'XXX/ORD-1999-00077')
  RETURNING * INTO a;
  ASSERT a.fiscal_year = 2030 AND a.doc_seq = 1, 'caller-supplied number is overwritten';
  ASSERT a.doc_number = 'ORD-2030-00001', 'doc number format';
  ASSERT a.doc_ref = v_code || '/ORD-2030-00001', 'doc ref carries the company code';
  ASSERT a.legacy_number IS NULL, 'no legacy for new rows';

  INSERT INTO app.order_acceptances (own_company_id, created_at, updated_at)
  VALUES (v_other, '2030-06-01 03:00:00+00', now()) RETURNING * INTO b;
  ASSERT b.doc_number = 'ORD-2030-00001', 'the other company also starts at 00001';
  ASSERT b.doc_ref = 'ZZT/ORD-2030-00001', 'same number, different ref';

  INSERT INTO app.order_acceptances (created_at, updated_at)
  VALUES ('2030-06-02 03:00:00+00', now()) RETURNING * INTO c;
  ASSERT c.doc_number = 'ORD-2030-00002', 'next number in the same company and year';

  -- ── 2. 年度は日本時間の暦日（3/31 15:00Z = 4/1 0:00 JST）─────────────────
  INSERT INTO app.order_acceptances (created_at, updated_at)
  VALUES ('2031-03-31 14:59:59+00', now()) RETURNING * INTO c;
  ASSERT c.doc_number = 'ORD-2030-00003', 'March 31 23:59 JST is still the old fiscal year';
  INSERT INTO app.order_acceptances (created_at, updated_at)
  VALUES ('2031-03-31 15:00:00+00', now()) RETURNING * INTO c;
  ASSERT c.doc_number = 'ORD-2031-00001', 'April 1 00:00 JST starts the new fiscal year';
  -- 業務日付（注文日）は年度に効かない — 起票日時だけで決まる
  INSERT INTO app.order_acceptances (created_at, order_date, updated_at)
  VALUES ('2031-04-10 03:00:00+00', '2029-01-01', now()) RETURNING * INTO c;
  ASSERT c.doc_number = 'ORD-2031-00002', 'business dates do not decide the fiscal year';

  -- ── 3. 巻き戻れば番号も戻る ─────────────────────────────────────────────
  BEGIN
    INSERT INTO app.order_acceptances (created_at, updated_at)
    VALUES ('2031-04-11 03:00:00+00', now()) RETURNING * INTO c;
    ASSERT c.doc_number = 'ORD-2031-00003', 'number taken inside the failed save';
    RAISE EXCEPTION 'rollback this save';
  EXCEPTION WHEN raise_exception THEN NULL;
  END;
  INSERT INTO app.order_acceptances (created_at, updated_at)
  VALUES ('2031-04-11 03:00:00+00', now()) RETURNING * INTO c;
  ASSERT c.doc_number = 'ORD-2031-00003', 'rolled-back number is handed out again (no gap)';

  -- ── 4. 番号は変えられない ───────────────────────────────────────────────
  failed := false;
  BEGIN
    UPDATE app.order_acceptances SET doc_number = 'ORD-2031-00099' WHERE id = c.id;
  EXCEPTION WHEN check_violation THEN failed := true;
  END;
  ASSERT failed, 'doc_number is frozen';
  failed := false;
  BEGIN
    UPDATE app.order_acceptances SET doc_seq = 99 WHERE id = c.id;
  EXCEPTION WHEN check_violation THEN failed := true;
  END;
  ASSERT failed, 'doc_seq is frozen';
  failed := false;
  BEGIN
    UPDATE app.order_acceptances SET fiscal_year = 2040 WHERE id = c.id;
  EXCEPTION WHEN check_violation THEN failed := true;
  END;
  ASSERT failed, 'fiscal_year is frozen';
  failed := false;
  BEGIN
    UPDATE app.order_acceptances SET doc_ref = 'ZZT/ORD-2031-00003' WHERE id = c.id;
  EXCEPTION WHEN check_violation THEN failed := true;
  END;
  ASSERT failed, 'doc_ref is frozen';
  failed := false;
  BEGIN
    UPDATE app.order_acceptances SET own_company_id = v_other WHERE id = c.id;
  EXCEPTION WHEN check_violation THEN failed := true;
  END;
  ASSERT failed, 'own_company_id is frozen';
  -- 番号以外の更新は通る（同じ値を書き戻す更新も）
  UPDATE app.order_acceptances SET notes = 't', doc_number = c.doc_number WHERE id = c.id;

  -- 一意制約と CHECK がある（トリガーを通らない書き込みへの最後の砦）
  SELECT count(*) INTO n FROM pg_constraint
   WHERE conrelid = 'app.order_acceptances'::regclass
     AND conname IN ('order_acceptances_doc_number_check', 'order_acceptances_doc_ref_check');
  ASSERT n = 2, 'CHECK constraints on the number';
  SELECT count(*) INTO n FROM pg_indexes
   WHERE schemaname = 'app' AND tablename = 'order_acceptances'
     AND indexname IN ('order_acceptances_own_company_id_fiscal_year_doc_seq_key',
                       'order_acceptances_own_company_id_doc_number_key',
                       'order_acceptances_doc_ref_key');
  ASSERT n = 3, 'unique indexes on the number';

  -- 対象の 15 表すべてに採番と変更禁止のトリガーがある
  SELECT count(*) INTO n FROM pg_trigger WHERE tgname = 'assign_document_number';
  ASSERT n = 15, format('assign_document_number on 15 tables (got %s)', n);
  SELECT count(*) INTO n FROM pg_trigger WHERE tgname = 'document_number_frozen';
  ASSERT n = 15, format('document_number_frozen on 15 tables (got %s)', n);

  -- ── 5. 注文明細番号 ─────────────────────────────────────────────────────
  INSERT INTO app.order_lines (acceptance_id, quantity) VALUES (b.id, 1) RETURNING * INTO l;
  ASSERT l.line_number IS NULL AND l.line_ref IS NULL, 'no line number before the branch is assigned';
  UPDATE app.order_lines SET branch = 2 WHERE id = l.id RETURNING * INTO l;
  ASSERT l.line_number = 'ORD-2030-00001-02', 'line number = acceptance number + branch';
  ASSERT l.line_ref = 'ZZT/ORD-2030-00001-02', 'line ref carries the company code';
  ASSERT app.to_doc_ref('order_lines', 'ORD-2030-00001-02') = v_code || '/ORD-2030-00001-02'
      OR app.to_doc_ref('order_lines', 'ORD-2030-00001-02') = 'ZZT/ORD-2030-00001-02',
    'a bare line number resolves to a ref';

  -- 番号だけでは 2 つの法人のどちらか決まらない → 黙って選ばない（NULL）
  ASSERT app.resolve_doc_ref('order_acceptances', 'ORD-2030-00001') IS NULL,
    'a number that exists in two companies is ambiguous';
  ASSERT app.resolve_doc_ref('order_acceptances', 'ORD-2030-00002') = v_code || '/ORD-2030-00002',
    'a number that exists once resolves';

  -- ── 6. 旧番号付きで入れた書類と、旧番号からの参照の引き方 ───────────────
  INSERT INTO app.order_acceptances (legacy_number, created_at, updated_at)
  VALUES ('ORD-209901-00007', '2031-05-01 03:00:00+00', now()) RETURNING * INTO c;
  ASSERT c.legacy_number = 'ORD-209901-00007', 'legacy number is kept as written';
  ASSERT c.doc_number = 'ORD-2031-00004', 'and a new number is allocated';

  ASSERT app.to_doc_ref('order_acceptances', 'ORD-209901-00007') = c.doc_ref, 'bare legacy number';
  ASSERT app.to_doc_ref('order_acceptances', v_code || '/ORD-209901-00007') = c.doc_ref, 'qualified legacy number';
  ASSERT app.resolve_doc_ref('order_acceptances', 'ORD-209901-00007') = c.doc_ref, 'resolve by legacy number';

  -- 注文明細: 旧番号 = 注文請書の旧番号 + 枝番
  INSERT INTO app.order_lines (acceptance_id, branch, quantity)
  VALUES (c.id, 1, 1) RETURNING * INTO l;
  ASSERT l.line_number = 'ORD-2031-00004-01', 'the line gets the new line number';
  ASSERT app.to_doc_ref('order_lines', 'ORD-209901-00007-01') = l.line_ref, 'legacy line number resolves';

  -- ── 7. 外注依頼の番号 ───────────────────────────────────────────────────
  INSERT INTO app.items (item_type, name, unit, updated_at)
  VALUES ('PRODUCT', '{"ja":"試験品"}', '本', now()) RETURNING id INTO v_item;
  INSERT INTO app.work_orders (work_order_number, type, planned_quantity, product_item_id,
                               own_company_id, created_at, updated_at)
  VALUES (990001, 'MANUFACTURE', 1, v_item, v_other, '2030-06-01 03:00:00+00', now())
  RETURNING * INTO w;
  ASSERT w.doc_number = 'WOR-2030-00001', 'work order document number';
  ASSERT w.work_order_number = 990001, 'lot number is untouched';
  SELECT id INTO v_step_cat FROM app.process_step_catalog ORDER BY id LIMIT 1;

  INSERT INTO app.work_order_steps (work_order_id, process_step_id, sort_order, execution_location)
  VALUES (w.id, v_step_cat, 1, 'OUTSOURCE') RETURNING id INTO v_step;
  SELECT count(*) INTO n FROM app.outsource_orders WHERE work_order_step_id = v_step;
  ASSERT n = 0, 'no outsource number before the request date';

  UPDATE app.work_order_steps SET outsource_requested_at = '2030-06-05' WHERE id = v_step;
  SELECT count(*) INTO n FROM app.outsource_orders WHERE work_order_step_id = v_step;
  ASSERT n = 1, 'the request date issues the outsource number';
  SELECT doc_ref INTO v_id FROM app.outsource_orders WHERE work_order_step_id = v_step;
  ASSERT v_id ~ '^ZZT/OUT-[0-9]{4}-00001$', format('outsource number in the work order company (%s)', v_id);

  UPDATE app.work_order_steps SET outsource_requested_at = '2030-06-06' WHERE id = v_step;
  SELECT count(*) INTO n FROM app.outsource_orders WHERE work_order_step_id = v_step;
  ASSERT n = 1, 'changing the date does not issue a second number';
  SELECT last_seq INTO n FROM app.document_sequences
   WHERE key = 'OUTSOURCE_ORDER' AND own_company_id = v_other;
  ASSERT n = 1, 'and does not burn a number';

  -- 工程を消しても番号の行は残る（番号は使い回さない）
  DELETE FROM app.work_order_steps WHERE id = v_step;
  SELECT count(*) INTO n FROM app.outsource_orders WHERE doc_ref = v_id AND work_order_step_id IS NULL;
  ASSERT n = 1, 'the number outlives the step';

  -- ── 8. 振り直し = 1 件ずつ作ったときと同じ番号 ─────────────────────────
  -- 試験法人の注文請書を、起票日時の順に 2 年度ぶん足す（b は 2030 年度の 1 件目）。
  INSERT INTO app.order_acceptances (own_company_id, created_at, updated_at)
  VALUES (v_other, '2030-07-01 03:00:00+00', now()),
         (v_other, '2031-02-01 03:00:00+00', now()),
         (v_other, '2031-04-01 03:00:00+00', now()),
         (v_other, '2031-09-01 03:00:00+00', now());
  SELECT array_agg(doc_ref ORDER BY id) INTO v_before
    FROM app.order_acceptances WHERE own_company_id = v_other;
  ASSERT array_length(v_before, 1) = 5, 'fixture size';

  -- 番号表を空に戻して振り直す。番号が 1 つでも変われば変更禁止トリガーが落とす。
  DELETE FROM app.document_sequences WHERE key = 'ORDER' AND own_company_id = v_other;
  PERFORM app.renumber_documents('order_acceptances', 'ORDER', 'ORD', 'created_at', v_other);
  SELECT array_agg(doc_ref ORDER BY id) INTO v_after
    FROM app.order_acceptances WHERE own_company_id = v_other;
  ASSERT v_after = v_before, 'renumbering reproduces live allocation';
  SELECT count(*) INTO n FROM app.document_sequences
   WHERE key = 'ORDER' AND own_company_id = v_other AND
         ((fiscal_year = 2030 AND last_seq = 3) OR (fiscal_year = 2031 AND last_seq = 2));
  ASSERT n = 2, 'sequences continue from the renumbered documents';

  -- 既定の法人の番号表には触っていない
  SELECT last_seq INTO n FROM app.document_sequences
   WHERE key = 'ORDER' AND own_company_id = v_default AND fiscal_year = 2031;
  ASSERT n = 4, 'other companies are untouched';
END $$;

ROLLBACK;

\echo 'document-numbering.sql: ok'
