-- 書類の uuid キー・子の <親>_id・発行元の自社法人の DB 側の試験
-- （20261126190000_doc_uuid_keys_own_company）。
--
-- 番号設計 PR-D1 から、アプリもシードも旧い番号の列（(year_month, seq) /
-- 子の (…_year_month, …_seq)）を書かない — 行は id、子は <親>_id だけで繋ぐ。
-- ここも新しい形だけで試す（旧列と同期トリガーは、旧コンテナが居なくなってから
-- 後続の migration で落とす）。
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

  INSERT INTO app.order_acceptances (updated_at) VALUES (now()) RETURNING * INTO a1;
  INSERT INTO app.order_acceptances (updated_at) VALUES (now()) RETURNING * INTO a2;

  -- 親: uuid が主キーとして払い出され、発行元は既定の法人
  ASSERT a1.id IS NOT NULL, 'uuid id assigned';
  ASSERT a1.own_company_id = v_default, 'own_company_id defaults to the default company';

  -- 子: <親>_id で繋がる。必須の参照は NOT NULL、親の無い id は FK で落ちる
  INSERT INTO app.order_acceptance_cancel_requests (acceptance_id, reason)
  VALUES (a1.id, 't') RETURNING * INTO r;
  ASSERT r.acceptance_id = a1.id, 'child points at the parent id';

  failed := false;
  BEGIN
    INSERT INTO app.order_acceptance_cancel_requests (acceptance_id, reason)
    VALUES (gen_random_uuid(), 't');
  EXCEPTION WHEN foreign_key_violation THEN failed := true;
  END;
  ASSERT failed, 'unknown parent id is rejected';

  failed := false;
  BEGIN
    INSERT INTO app.order_acceptance_cancel_requests (reason) VALUES ('t');
  EXCEPTION WHEN not_null_violation THEN failed := true;
  END;
  ASSERT failed, 'a required parent cannot be left out';

  -- 承認待ちの取消依頼は注文請書ごとに 1 本（部分 unique は id 側）
  failed := false;
  BEGIN
    INSERT INTO app.order_acceptance_cancel_requests (acceptance_id, reason) VALUES (a1.id, 't2');
  EXCEPTION WHEN unique_violation THEN failed := true;
  END;
  ASSERT failed, 'one pending cancel request per acceptance';

  -- 任意の参照（自己参照）: 付ける / 外す
  UPDATE app.order_acceptances SET replaces_id = a1.id WHERE id = a2.id RETURNING * INTO a2;
  ASSERT a2.replaces_id = a1.id, 'optional ref set by id';
  UPDATE app.order_acceptances SET replaces_id = NULL WHERE id = a2.id RETURNING * INTO a2;
  ASSERT a2.replaces_id IS NULL, 'optional ref cleared';

  -- 発行元は作成後に変えられない
  failed := false;
  BEGIN
    UPDATE app.order_acceptances SET own_company_id = own_company_id + 1000 WHERE id = a1.id;
  EXCEPTION WHEN check_violation THEN failed := true;
  END;
  ASSERT failed, 'own_company_id is immutable';
END $$;

ROLLBACK;
