-- 書類番号の基盤（20261126150000_document_sequences）の DB 側の試験。
--
-- CI の migrate-deploy ジョブと tools/ci/local-check.sh（migrate_fresh）が、
-- まっさらな DB に migrate deploy した直後に `ON_ERROR_STOP=1` で流す。
-- 全体を 1 トランザクションにして最後に ROLLBACK するので DB には何も残らない。
--
-- 境界の表は nextjs-web src/lib/fiscal-year-core.test.ts と同じ — 双子が
-- 割れていないことはこの 2 つが同じ答えを出すことで担保している。行を足すときは
-- 両方に足す。

BEGIN;

-- ── fiscal_year_of / jst_date / format_doc_number（TS と同じ表）─────────────
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT * FROM (VALUES
      (4,  DATE '2026-04-01', 2026),
      (4,  DATE '2027-03-31', 2026),
      (4,  DATE '2027-04-01', 2027),
      (4,  DATE '2026-12-31', 2026),
      (4,  DATE '2027-01-01', 2026),
      (1,  DATE '2026-01-01', 2026),
      (1,  DATE '2026-12-31', 2026),
      (12, DATE '2026-12-01', 2026),
      (12, DATE '2026-11-30', 2025),
      (12, DATE '2027-01-01', 2026)
    ) AS t(start_month, d, fy)
  LOOP
    ASSERT app.fiscal_year_of(r.start_month, r.d) = r.fy,
      format('fiscal_year_of(%s, %s) = %s, expected %s',
             r.start_month, r.d, app.fiscal_year_of(r.start_month, r.d), r.fy);
  END LOOP;

  -- 時刻は日本時間の暦日で切る（3/31 15:00Z = 4/1 JST）
  ASSERT app.jst_date(TIMESTAMPTZ '2027-03-31 15:00:00+00') = DATE '2027-04-01', 'jst_date 15:00Z';
  ASSERT app.jst_date(TIMESTAMPTZ '2027-03-31 14:59:59+00') = DATE '2027-03-31', 'jst_date 14:59Z';
  ASSERT app.jst_date(TIMESTAMPTZ '2026-12-31 15:00:00+00') = DATE '2027-01-01', 'jst_date new year';
  ASSERT app.fiscal_year_of(4, app.jst_date(TIMESTAMPTZ '2027-03-31 15:00:00+00')) = 2027, 'fy at 15:00Z';
  ASSERT app.fiscal_year_of(4, app.jst_date(TIMESTAMPTZ '2027-03-31 14:59:59+00')) = 2026, 'fy at 14:59Z';

  ASSERT app.format_doc_number('QOT', 2026, 1) = 'QOT-2026-00001', 'format 1';
  ASSERT app.format_doc_number('PO', 2026, 99999) = 'PO-2026-99999', 'format max';
  ASSERT app.format_doc_number('INV', 2027, 123) = 'INV-2027-00123', 'format 123';
END $$;

-- 範囲外は拒否（丸めない）
DO $$
DECLARE
  bad text[] := ARRAY[
    $q$SELECT app.fiscal_year_of(0, DATE '2026-04-01')$q$,
    $q$SELECT app.fiscal_year_of(13, DATE '2026-04-01')$q$,
    $q$SELECT app.format_doc_number('qot', 2026, 1)$q$,
    $q$SELECT app.format_doc_number('QOTXX', 2026, 1)$q$,
    $q$SELECT app.format_doc_number('QOT', 999, 1)$q$,
    $q$SELECT app.format_doc_number('QOT', 2026, 0)$q$,
    $q$SELECT app.format_doc_number('QOT', 2026, 100000)$q$
  ];
  q text;
  raised boolean;
BEGIN
  FOREACH q IN ARRAY bad LOOP
    raised := false;
    BEGIN
      EXECUTE q;
    EXCEPTION WHEN invalid_parameter_value THEN
      raised := true;
    END;
    ASSERT raised, 'expected rejection: ' || q;
  END LOOP;
END $$;

-- ── allocate_document_seq ───────────────────────────────────────────────────
DO $$
DECLARE
  c_id  int;
  r     record;
  raised boolean;
BEGIN
  -- 試験用の法人（ROLLBACK で消える）。既定の法人（CKK）には触らない。
  INSERT INTO app.own_companies (code, name, fiscal_year_start_month, updated_at)
  VALUES ('ZZTEST', '{"ja":"試験"}', 4, now())
  RETURNING id INTO c_id;

  -- 年度の初番は 1、同じ年度では続き番号
  SELECT * INTO r FROM app.allocate_document_seq('QUOTE', c_id, DATE '2026-04-01');
  ASSERT r.fiscal_year = 2026 AND r.seq = 1, format('first: %s', r);
  SELECT * INTO r FROM app.allocate_document_seq('QUOTE', c_id, DATE '2027-03-31');
  ASSERT r.fiscal_year = 2026 AND r.seq = 2, format('same FY: %s', r);

  -- 年度が変われば 1 から
  SELECT * INTO r FROM app.allocate_document_seq('QUOTE', c_id, DATE '2027-04-01');
  ASSERT r.fiscal_year = 2027 AND r.seq = 1, format('next FY: %s', r);

  -- 書類種別（key）ごとに独立
  SELECT * INTO r FROM app.allocate_document_seq('INVOICE', c_id, DATE '2026-05-01');
  ASSERT r.fiscal_year = 2026 AND r.seq = 1, format('other key: %s', r);

  -- 法人ごとに独立（既定の法人 CKK は別の列）
  SELECT * INTO r FROM app.allocate_document_seq(
    'QUOTE', (SELECT id FROM app.own_companies WHERE code = 'CKK'), DATE '2026-04-01');
  ASSERT r.seq = 1, format('other company: %s', r);

  -- サブトランザクションが巻き戻れば番号も戻る（欠番なし）
  BEGIN
    PERFORM app.allocate_document_seq('QUOTE', c_id, DATE '2026-06-01');
    RAISE EXCEPTION 'rollback me' USING ERRCODE = 'P0001';
  EXCEPTION WHEN raise_exception THEN
    NULL;
  END;
  SELECT * INTO r FROM app.allocate_document_seq('QUOTE', c_id, DATE '2026-06-01');
  ASSERT r.seq = 3, format('rollback returns the number: %s', r);

  -- 99999 を使い切ったら払い出さない
  UPDATE app.document_sequences SET last_seq = 99999
   WHERE key = 'QUOTE' AND own_company_id = c_id AND fiscal_year = 2026;
  raised := false;
  BEGIN
    PERFORM app.allocate_document_seq('QUOTE', c_id, DATE '2026-06-01');
  EXCEPTION WHEN check_violation THEN
    raised := true;
  END;
  ASSERT raised, 'exhausted sequence must raise';

  -- 存在しない法人・日付なしは拒否
  raised := false;
  BEGIN
    PERFORM app.allocate_document_seq('QUOTE', -1, DATE '2026-06-01');
  EXCEPTION WHEN foreign_key_violation THEN
    raised := true;
  END;
  ASSERT raised, 'unknown company must raise';
  raised := false;
  BEGIN
    PERFORM app.allocate_document_seq('QUOTE', c_id, NULL);
  EXCEPTION WHEN invalid_parameter_value THEN
    raised := true;
  END;
  ASSERT raised, 'null date must raise';

  -- 採番済みの法人は開始月を変えられない…
  raised := false;
  BEGIN
    UPDATE app.own_companies SET fiscal_year_start_month = 1 WHERE id = c_id;
  EXCEPTION WHEN check_violation THEN
    raised := true;
  END;
  ASSERT raised, 'fiscal month must be locked after numbering';
  -- …が同じ値の UPDATE や他の列の更新は通る
  UPDATE app.own_companies SET fiscal_year_start_month = 4, notes = 'x' WHERE id = c_id;
END $$;

-- 未採番の法人は開始月を変えられる
DO $$
DECLARE
  c_id int;
BEGIN
  INSERT INTO app.own_companies (code, name, fiscal_year_start_month, updated_at)
  VALUES ('ZZFREE', '{"ja":"試験2"}', 4, now())
  RETURNING id INTO c_id;
  UPDATE app.own_companies SET fiscal_year_start_month = 1 WHERE id = c_id;
  ASSERT (SELECT fiscal_year_start_month FROM app.own_companies WHERE id = c_id) = 1,
    'unnumbered company can change its start month';
END $$;

ROLLBACK;

\echo 'document-sequences.sql: ok'
