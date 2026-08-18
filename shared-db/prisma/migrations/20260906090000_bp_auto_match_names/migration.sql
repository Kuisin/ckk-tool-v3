-- 照合名を「人が入れるもの」と「フリガナから自動で作るもの」に分ける。
--
-- match_names は画面（AI照合名）で編集する列。ここにフリガナ由来のかな・
-- ローマ字まで混ぜると、利用者から見て「自分が入れていないものが増える」
-- 分かりにくい列になる。
--
-- match_names_auto は **name_kana から機械的に作る**列で、画面には出さない。
-- 突合（lib/intake.matchCustomer）は両方を見る。
ALTER TABLE app.business_partners
  ADD COLUMN IF NOT EXISTS match_names_auto text[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN app.business_partners.match_names_auto IS
  'フリガナ等から自動生成した照合名（カタカナ/ひらがな/ローマ字）。UI では編集しない。';

CREATE INDEX IF NOT EXISTS business_partners_match_names_auto_idx
  ON app.business_partners USING gin (match_names_auto);
