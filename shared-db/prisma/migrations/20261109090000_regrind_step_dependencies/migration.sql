-- 再研磨の工程に、**文書どおりの**使用依存・実行依存を入れる。
--
-- ## なぜ抜けていたか
--
-- 再研磨の工程カタログは 20261106090001 が足した（製品受入（再研磨）+ 研磨 6 種
-- + 再研磨検査）が、**依存行は 1 本も入れなかった**。そのため製造側の工程が
-- すべて依存で守られているのに、再研磨の工程だけは
--   - 製品受入（再研磨）を入れずに研磨だけの指示書が作れる
--   - 受入がまだ完了していないのに研磨を開始できる
--   - 研磨が 1 つも終わっていないのに再研磨検査を開始できる
-- という状態だった。
--
-- ## 何を入れるか（_docs/manufacturing_details.md「工程一覧」より）
--
--   外周研磨 / 溝研磨 / 先端研磨 / R研磨 / C研磨 / 切断（再研磨）
--       使用依存: 製品受入（再研磨）
--       実行依存: 前工程の完了
--   再研磨検査
--       使用依存: 研磨工程
--       実行依存: 研磨の完了
--
-- **文書に無いものは入れない。** とくに:
--   - 研磨工程どうしの順序は決めない。文書は順序を書いておらず、外周・溝・先端・
--     R・C は同期可（同時に実施・記録できる）なので、鎖にすると現場と食い違う。
--     研磨の「前工程」= 製品受入（再研磨）と読む。
--   - 研磨 → 再研磨検査 の**使用**依存は張らない。文書の検査必須ルールが挙げるのは
--     円筒加工・段加工・製作・首逃し・LD で、再研磨は入っていない。再研磨検査には
--     「出荷前検査で代替してもよい」と明記もある。必須にすると代替できなくなる。
--   - 切断（後加工）・C面（後加工）・端面（後加工）は文書が依存を「?」としている
--     ので触らない（分かっていないことを、分かっているように書かない）。
--
-- ## 依存の効き方（lib/workflow-core.ts）
--
-- **指示書に入っていない工程への依存は空真**（`不在 = 空真`）。だから再研磨検査の
-- 実行依存を研磨 6 種すべてに AND で張っても、要求されるのはその指示書に実際に
-- 載っている研磨だけ — 製作検査が 溝・刃裏・外周・先端・ホーニング すべてに AND を
-- 張っているのと同じ形。
-- 使用依存の OR は「そのうち 1 つは載っていること」なので、再研磨検査は OR で張る。
--
-- ## 既存データ
--
-- 再研磨の指示書は開始工程（製品受入（再研磨））を必ず持つ
-- （`requiredStartCodeForType`）ので、いま有効な指示書・工程リストがこの依存で
-- 不整合になることは無い。

-- ── 研磨 6 種: 製品受入（再研磨）が要る ─────────────────────────────────────
-- id は環境ごとに違い得る（カタログ行は ON CONFLICT (code) で入れたため連番）。
-- **必ず code で引く。**
INSERT INTO app.process_step_use_dependencies
  (step_id, depends_on_step_id, relation, is_negation, notes)
SELECT s.id, r.id, 'AND', false, '製品受入（再研磨）'
  FROM app.process_step_catalog s
 CROSS JOIN app.process_step_catalog r
 WHERE r.code = 'REGRIND_RECEIPT'
   AND s.code IN ('REGRIND_OD', 'REGRIND_FLUTE', 'REGRIND_TIP',
                  'REGRIND_RADIUS', 'REGRIND_CHAMFER', 'REGRIND_CUT')
ON CONFLICT (step_id, depends_on_step_id) DO NOTHING;

INSERT INTO app.process_step_exec_dependencies
  (step_id, depends_on_step_id, relation, notes)
SELECT s.id, r.id, 'AND', '製品受入（再研磨）の完了'
  FROM app.process_step_catalog s
 CROSS JOIN app.process_step_catalog r
 WHERE r.code = 'REGRIND_RECEIPT'
   AND s.code IN ('REGRIND_OD', 'REGRIND_FLUTE', 'REGRIND_TIP',
                  'REGRIND_RADIUS', 'REGRIND_CHAMFER', 'REGRIND_CUT')
ON CONFLICT (step_id, depends_on_step_id) DO NOTHING;

-- ── 再研磨検査: 研磨工程が要る / 研磨の完了で開始できる ─────────────────────
INSERT INTO app.process_step_use_dependencies
  (step_id, depends_on_step_id, relation, is_negation, notes)
SELECT i.id, g.id, 'OR', false, '研磨工程'
  FROM app.process_step_catalog i
 CROSS JOIN app.process_step_catalog g
 WHERE i.code = 'REGRIND_INSPECTION'
   AND g.code IN ('REGRIND_OD', 'REGRIND_FLUTE', 'REGRIND_TIP',
                  'REGRIND_RADIUS', 'REGRIND_CHAMFER', 'REGRIND_CUT')
ON CONFLICT (step_id, depends_on_step_id) DO NOTHING;

INSERT INTO app.process_step_exec_dependencies
  (step_id, depends_on_step_id, relation, notes)
SELECT i.id, g.id, 'AND', '研磨の完了'
  FROM app.process_step_catalog i
 CROSS JOIN app.process_step_catalog g
 WHERE i.code = 'REGRIND_INSPECTION'
   AND g.code IN ('REGRIND_OD', 'REGRIND_FLUTE', 'REGRIND_TIP',
                  'REGRIND_RADIUS', 'REGRIND_CHAMFER', 'REGRIND_CUT')
ON CONFLICT (step_id, depends_on_step_id) DO NOTHING;
