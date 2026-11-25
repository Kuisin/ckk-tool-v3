-- 書類番号の会計年度・連番の基盤（番号設計 PR-A）。
-- **既存の書類の番号はまだ 1 つも変えない** — 関数・表・トリガーを置くだけで、
-- 書類側からはまだ誰も呼ばない（書類テーブルの BEFORE INSERT トリガーと
-- 既存書類の振り直しは PR-C）。
--
-- 決定（利用者、2026-11-25）:
--   - 書類番号は PREFIX-FFFF-NNNNN（例 QOT-2026-00001）。連番は
--     **自社法人 × 会計年度** ごと。法人は番号の文字列には入らない。
--   - 会計年度のラベル = その年度が**始まる暦年**。開始月は法人ごと
--     （own_companies.fiscal_year_start_month。CKK・TSP とも 4 月）。
--   - どの年度に入るかは**書類自身の日付**で決める（無ければ作成日時）。
--     時刻は**日本時間の暦日**に直してから年度を引く（app.jst_date）。
--   - 番号は **DB が払い出す**（app.allocate_document_seq）。呼び出し側の
--     トランザクションの中で動くので、保存が巻き戻れば番号も戻る（欠番なし）。
--   - 開始月を変えられるのは、その法人がまだ 1 件も採番していない間だけ。
--     採番後に変えると、同じ日付の書類が別の年度に入り得て区切りが崩れる。
--
-- TS 側の双子は nextjs-web src/lib/fiscal-year-core.ts。同じ境界の試験を
-- shared-db/ci/sql-tests/document-sequences.sql が SQL 側で持つ（CI の
-- migrate-deploy ジョブと tools/ci/local-check.sh が流す）。
--
-- 以下 CreateTable 〜 AddForeignKey は prisma migrate diff の生成そのまま。
-- CHECK・関数・トリガーは末尾に手で足してある。

-- CreateTable
CREATE TABLE "app"."document_sequences" (
    "key" TEXT NOT NULL,
    "own_company_id" INTEGER NOT NULL,
    "fiscal_year" INTEGER NOT NULL,
    "last_seq" INTEGER NOT NULL,

    CONSTRAINT "document_sequences_pkey" PRIMARY KEY ("key","own_company_id","fiscal_year")
);

-- CreateIndex
CREATE INDEX "document_sequences_own_company_id_idx" ON "app"."document_sequences"("own_company_id");

-- AddForeignKey
ALTER TABLE "app"."document_sequences" ADD CONSTRAINT "document_sequences_own_company_id_fkey" FOREIGN KEY ("own_company_id") REFERENCES "app"."own_companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── 以下は手で足した分（Prisma スキーマからは生成されない）────────────────────

-- 連番は 5 桁（NNNNN）に収まる範囲。超えたら番号の形が崩れるので DB で止める。
ALTER TABLE "app"."document_sequences"
  ADD CONSTRAINT "document_sequences_last_seq_check"
  CHECK ("last_seq" BETWEEN 1 AND 99999);

-- 年度は 4 桁（FFFF）。
ALTER TABLE "app"."document_sequences"
  ADD CONSTRAINT "document_sequences_fiscal_year_check"
  CHECK ("fiscal_year" BETWEEN 1000 AND 9999);

-- 時刻 → 日本時間の暦日。年度は暦日で決めるので、timestamptz は必ずここを
-- 通してから fiscal_year_of に渡す（UTC のまま切ると 3/31 15:00Z = 4/1 JST が
-- 前年度に落ちる）。fiscal_year_of に timestamptz の多重定義を置かないのは、
-- 型の無いリテラル（'2026-04-01'）が timestamptz 側へ解決されてしまうため。
CREATE OR REPLACE FUNCTION "app"."jst_date"(ts timestamptz)
RETURNS date
LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE AS $$
  SELECT (ts AT TIME ZONE 'Asia/Tokyo')::date
$$;

-- 暦日 → 会計年度（開始月以上ならその暦年、未満なら前年）。ラベルは年度が
-- 始まる暦年。開始月 1 なら暦年と一致する。
CREATE OR REPLACE FUNCTION "app"."fiscal_year_of"(start_month int, d date)
RETURNS int
LANGUAGE plpgsql IMMUTABLE STRICT PARALLEL SAFE AS $$
BEGIN
  IF start_month NOT BETWEEN 1 AND 12 THEN
    RAISE EXCEPTION 'fiscal_year_of: start_month must be 1..12 (got %)', start_month
      USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF EXTRACT(MONTH FROM d)::int >= start_month THEN
    RETURN EXTRACT(YEAR FROM d)::int;
  END IF;
  RETURN EXTRACT(YEAR FROM d)::int - 1;
END;
$$;

-- 'QOT', 2026, 1 → 'QOT-2026-00001'。形を外れる入力は丸めずに拒否する。
CREATE OR REPLACE FUNCTION "app"."format_doc_number"(prefix text, fy int, seq int)
RETURNS text
LANGUAGE plpgsql IMMUTABLE STRICT PARALLEL SAFE AS $$
BEGIN
  IF prefix !~ '^[A-Z]{2,4}$' THEN
    RAISE EXCEPTION 'format_doc_number: bad prefix %', prefix
      USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF fy NOT BETWEEN 1000 AND 9999 THEN
    RAISE EXCEPTION 'format_doc_number: fiscal year must be 4 digits (got %)', fy
      USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF seq NOT BETWEEN 1 AND 99999 THEN
    RAISE EXCEPTION 'format_doc_number: seq must be 1..99999 (got %)', seq
      USING ERRCODE = 'invalid_parameter_value';
  END IF;
  RETURN prefix || '-' || fy::text || '-' || lpad(seq::text, 5, '0');
END;
$$;

-- 連番を 1 つ払い出す。**呼び出し側のトランザクションの中で**動く（自前で
-- COMMIT しない）ので、保存が巻き戻れば番号も戻る。
--
-- 法人の行を FOR SHARE で掴むのは、開始月の変更（下のトリガー）と順序を
-- 付けるため: 変更が先なら新しい開始月で年度を引き、払い出しが先なら変更側が
-- 待ったうえで「採番済み」を見て拒否される。どちらの順でも、古い開始月で
-- 引いた年度の行が新しい開始月と並ぶことはない。
CREATE OR REPLACE FUNCTION "app"."allocate_document_seq"(p_key text, p_company int, p_date date)
RETURNS TABLE (fiscal_year int, seq int)
LANGUAGE plpgsql VOLATILE AS $$
DECLARE
  v_month int;
  v_fy    int;
  v_seq   int;
BEGIN
  IF p_key IS NULL OR btrim(p_key) = '' THEN
    RAISE EXCEPTION 'allocate_document_seq: key is required'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF p_date IS NULL THEN
    RAISE EXCEPTION 'allocate_document_seq: date is required (fall back to app.jst_date(created_at))'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  SELECT c."fiscal_year_start_month" INTO v_month
    FROM "app"."own_companies" c
   WHERE c."id" = p_company
     FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'allocate_document_seq: own company % not found', p_company
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  v_fy := "app"."fiscal_year_of"(v_month, p_date);

  INSERT INTO "app"."document_sequences" AS s ("key", "own_company_id", "fiscal_year", "last_seq")
  VALUES (p_key, p_company, v_fy, 1)
  -- 列名で書くと OUT 引数 fiscal_year と曖昧になるので制約名で指す
  ON CONFLICT ON CONSTRAINT "document_sequences_pkey"
  DO UPDATE SET "last_seq" = s."last_seq" + 1
          WHERE s."last_seq" < 99999
  RETURNING s."last_seq" INTO v_seq;

  -- WHERE で弾かれた = 99999 を使い切った。CHECK に任せず意味のある文で落とす。
  IF v_seq IS NULL THEN
    RAISE EXCEPTION 'allocate_document_seq: % for company % fiscal year % is exhausted (99999)',
      p_key, p_company, v_fy
      USING ERRCODE = 'check_violation';
  END IF;

  fiscal_year := v_fy;
  seq := v_seq;
  RETURN NEXT;
END;
$$;

-- 開始月は「その法人がまだ採番していない間」だけ変えられる。
-- 画面（MS0I）も同じ条件で欄を閉じるが、psql やスクリプトからの変更も DB で止める。
CREATE OR REPLACE FUNCTION "app"."own_companies_fiscal_month_lock"()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."fiscal_year_start_month" IS DISTINCT FROM OLD."fiscal_year_start_month"
     AND EXISTS (SELECT 1 FROM "app"."document_sequences" s
                  WHERE s."own_company_id" = OLD."id") THEN
    RAISE EXCEPTION 'own_companies.fiscal_year_start_month is locked: company % already has numbered documents',
      OLD."code"
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "own_companies_fiscal_month_lock"
  BEFORE UPDATE OF "fiscal_year_start_month" ON "app"."own_companies"
  FOR EACH ROW EXECUTE FUNCTION "app"."own_companies_fiscal_month_lock"();
