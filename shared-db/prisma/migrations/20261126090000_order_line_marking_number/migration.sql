-- 印字番号（A{base}-NNN）の基数を注文明細に持たせる。
--
-- 製品にはレーザーで通し番号を刻む — 1 本ずつ（A200000-001..）か、明細ごとに
-- 1 つ（A200000）。どちらも同じ基数から導けるので、列は基数 1 本だけ。
-- 基数は注文番号・ロット番号とは別の通し連番で、200000 から始まり月次リセット
-- しない。
--
-- ★ 採番は **DB が行う**（アプリは書かない）。専用の SEQUENCE を、明細が
--   確定した瞬間（branch が入った更新）に BEFORE トリガーが nextval で引く。
--   - アプリの採番（numbering_sequences の upsert）に比べ、どの書き込み経路
--     （画面・API・psql・復元スクリプト）から確定しても必ず振られ、
--     二重払い出しが起きない（nextval は並行でも一意）。
--   - 欠番は許す（確定が巻き戻ると番号は戻らない）。刻印番号は一意で
--     あればよく、連番の隙間に意味は無い。
--   - 一度入った基数は変えられない（トリガーが拒否）。刻んだ後の製品の番号が
--     DB 側でずれることは無い。UNIQUE は保険として残す。
--
-- ローリングデプロイ:
--   * 列は nullable で足すだけ。旧アプリは知らないので触らない。旧アプリが
--     確定しても、トリガーが同じように振る。
--   * この機能より前に確定した明細は null のまま（遡って振らない）。
--   * nextval の権限は grants.sql の GRANT ALL ON ALL SEQUENCES IN SCHEMA app
--     が毎デプロイで与える。

CREATE SEQUENCE "app"."marking_number_seq" AS integer START WITH 200000 MINVALUE 200000 NO CYCLE;

ALTER TABLE "app"."order_lines" ADD COLUMN "marking_base" INTEGER;

CREATE UNIQUE INDEX "order_lines_marking_base_key" ON "app"."order_lines"("marking_base");

CREATE FUNCTION "app"."order_lines_marking_base"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  -- 一度振った基数は不変（null へ戻すのも含めて拒否）。
  IF TG_OP = 'UPDATE' AND OLD.marking_base IS NOT NULL
     AND NEW.marking_base IS DISTINCT FROM OLD.marking_base THEN
    RAISE EXCEPTION 'order_lines.marking_base is immutable once issued (% -> %)',
      OLD.marking_base, NEW.marking_base
      USING ERRCODE = 'check_violation';
  END IF;
  -- 確定（枝番が入った）明細で未採番なら、ここで振る。値はアプリから
  -- 受け取らない — 確定時の採番の唯一の経路をこのトリガーにする。
  IF NEW.marking_base IS NULL AND NEW.branch IS NOT NULL
     AND (TG_OP = 'INSERT' OR OLD.branch IS NULL) THEN
    NEW.marking_base := nextval('app.marking_number_seq');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "order_lines_marking_base"
  BEFORE INSERT OR UPDATE ON "app"."order_lines"
  FOR EACH ROW EXECUTE FUNCTION "app"."order_lines_marking_base"();
