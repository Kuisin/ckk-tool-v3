-- allow-destructive: CHECK を張り替えるための DROP CONSTRAINT。列も表も消さない。
--
-- 20261101090000_items_stage3_matching_forms より**前**に流れる（名前順）。
--
-- あの migration は ③ で match_aliases の行を target_type = 'items' に書き換えて
-- から ④ で CHECK を items 用に張り替える。順序が逆で、旧 CHECK
-- （business_partners / products のみ）が残ったまま ③ が走るため、学習済みの
-- 行が 1 件でもある DB では ③ が 23514 で落ちる。CI の空 DB では行が無く
-- ③ が何もしないので通り、dev の db-migrate で初めて落ちた（2026-09-20）。
--
-- merge 済みの migration は書き換えない（checksum が変わり P3006 になる）ので、
-- 手前に 1 本足して CHECK を先に広げる。名前は同じ match_aliases_target_type_check
-- のまま — あの migration の ④ が DROP IF EXISTS → ADD で最終形
-- （business_partners / items）に締め直すので、ここは通り道の広さだけを持つ。
-- まっさらな DB でも結果は同じ（広げる → 締める）。
--
-- 20261101090000 が**先に**当たっている DB（CI の使い捨て DB など、この migration が
-- 足される前に一度通した環境）では CHECK は既に最終形なので触らない。
-- 触ると最終形を広げ直してしまう。
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'app.match_aliases'::regclass
       AND conname  = 'match_aliases_target_type_check'
       AND pg_get_constraintdef(oid) NOT LIKE '%''items''%'
  ) THEN
    ALTER TABLE app.match_aliases DROP CONSTRAINT match_aliases_target_type_check;
    ALTER TABLE app.match_aliases
      ADD CONSTRAINT match_aliases_target_type_check
      CHECK (target_type = ANY (ARRAY['business_partners'::text, 'products'::text, 'materials'::text, 'items'::text]));
  END IF;
END $$;
