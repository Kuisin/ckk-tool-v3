-- 書類の uuid キー・子の <親>_id 同期・発行元の自社法人
-- （20261126190000_doc_uuid_keys_own_company）の DB 側の試験。
--
-- document-sequences.sql と同じく、まっさらな DB に migrate deploy した直後に
-- `ON_ERROR_STOP=1` で流す。全体を 1 トランザクションにして最後に ROLLBACK する。

BEGIN;

DO $$
DECLARE
  v_default int := app.default_own_company_id();
  a1 app.order_acceptances%ROWTYPE;
  a2 app.order_acceptances%ROWTYPE;
  r  app.order_acceptance_cancel_requests%ROWTYPE;
  failed boolean;
BEGIN
  ASSERT v_default IS NOT NULL, 'default own company exists';

  INSERT INTO app.order_acceptances (year_month, seq, updated_at)
  VALUES ('209901', 1, now()) RETURNING * INTO a1;
  INSERT INTO app.order_acceptances (year_month, seq, updated_at)
  VALUES ('209901', 2, now()) RETURNING * INTO a2;

  -- 親: uuid が主キーとして払い出され、発行元は既定の法人
  ASSERT a1.id IS NOT NULL, 'uuid id assigned';
  ASSERT a1.own_company_id = v_default, 'own_company_id defaults to the default company';

  -- 子: id だけを書けば旧 (year_month, seq) が埋まる
  INSERT INTO app.order_acceptance_cancel_requests (acceptance_id, reason)
  VALUES (a1.id, 't') RETURNING * INTO r;
  ASSERT r.acceptance_year_month = '209901' AND r.acceptance_seq = 1, 'legacy columns from id';

  -- 子: 旧列だけを書けば id が埋まる（シード・スクリプトの INSERT）
  INSERT INTO app.order_acceptance_cancel_requests (acceptance_year_month, acceptance_seq, reason)
  VALUES ('209901', 2, 't') RETURNING * INTO r;
  ASSERT r.acceptance_id = a2.id, 'id from legacy columns';

  -- 任意の参照（自己参照）: 付ける / 付け替える / 外す
  UPDATE app.order_acceptances SET replaces_id = a1.id WHERE id = a2.id RETURNING * INTO a2;
  ASSERT a2.replaces_year_month = '209901' AND a2.replaces_seq = 1, 'optional ref set by id';
  UPDATE app.order_acceptances SET replaces_year_month = NULL, replaces_seq = NULL
   WHERE id = a2.id RETURNING * INTO a2;
  ASSERT a2.replaces_id IS NULL, 'clearing legacy columns clears id';
  UPDATE app.order_acceptances SET replaces_year_month = '209901', replaces_seq = 1
   WHERE id = a2.id RETURNING * INTO a2;
  ASSERT a2.replaces_id = a1.id, 'legacy update resolves id';
  UPDATE app.order_acceptances SET replaces_id = NULL WHERE id = a2.id RETURNING * INTO a2;
  ASSERT a2.replaces_year_month IS NULL AND a2.replaces_seq IS NULL, 'clearing id clears legacy';

  -- 必須の参照で親が無い旧値は id が埋まらず NOT NULL で落ちる（黙って繋がない）
  failed := false;
  BEGIN
    INSERT INTO app.order_acceptance_cancel_requests (acceptance_year_month, acceptance_seq, reason)
    VALUES ('209901', 99, 't');
  EXCEPTION WHEN not_null_violation THEN failed := true;
  END;
  ASSERT failed, 'unknown legacy key is rejected';

  -- 発行元は作成後に変えられない
  failed := false;
  BEGIN
    UPDATE app.order_acceptances SET own_company_id = own_company_id + 1000 WHERE id = a1.id;
  EXCEPTION WHEN check_violation THEN failed := true;
  END;
  ASSERT failed, 'own_company_id is immutable';
END $$;

ROLLBACK;
