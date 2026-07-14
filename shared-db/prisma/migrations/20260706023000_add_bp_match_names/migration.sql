-- AI 抽出（po-extract）の社名照合用リスト。表記ゆれをすべて保持する。
ALTER TABLE "app"."business_partners"
  ADD COLUMN "match_names" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
