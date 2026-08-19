-- 製品・素材のキーワード（検索 / AI 突合）。
--
-- 取引先（business_partners.match_names）と同じ考え方を製品・素材にも置く:
-- 名称の表記は 1 つしか持てないが、人が探すときも、注文書から AI が突合する
-- ときも、実際に使われる呼び方は複数ある（略称・読み・英字・寸法の別表記）。
-- ここに並べたものが検索キーと突合キーの両方になる。
--
-- 取引先と違い自動生成列（match_names_auto）は作らない — 製品名の読みは
-- 機械的に作れないので、候補は po-extract の /generate/keywords に作らせ、
-- 人が採用したものだけがこの列に入る。
ALTER TABLE app.products
  ADD COLUMN IF NOT EXISTS match_names text[] NOT NULL DEFAULT '{}';

ALTER TABLE app.materials
  ADD COLUMN IF NOT EXISTS match_names text[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN app.products.match_names IS
  '検索・AI 突合用のキーワード（別名・略称・読み・英字表記）。';
COMMENT ON COLUMN app.materials.match_names IS
  '検索・AI 突合用のキーワード（別名・略称・読み・英字表記）。';

-- 突合は完全一致（k = ANY(match_names)）、検索は unnest + ILIKE で舐める。
-- 前者のために GIN を張る（取引先と同じ）。
CREATE INDEX IF NOT EXISTS products_match_names_idx
  ON app.products USING gin (match_names);
CREATE INDEX IF NOT EXISTS materials_match_names_idx
  ON app.materials USING gin (match_names);
