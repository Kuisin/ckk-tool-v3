-- 検査承認工程は数量を持たない。
--
-- 検査承認は「前の工程の検査表を見て、良いと判断して印を押す」ゲートで、
-- 物を加工する工程ではない。それなのにカタログの 6 件すべてが
-- quantity_tracking = 'FLOW' だったため、承認するだけの工程を完了するのに
-- 受入数・良品数・不良の内訳を入力させていた（現場のタブレットでは、承認の
-- あとに数量フォームがもう 1 枚出る）。入力しても意味のある数ではないので、
-- 「前工程と同じ数を打ち直す」だけの作業になっていた。
--
-- 'NONE'（数量記録なしのパススルー）にする。NONE の完了は
-- 受入数 = 既存 ?? 想定受入 ?? 予定数量、良品数 = 受入数、不良 0 で保存されるので、
-- expectedInput の前工程チェーン・validateRouting・computeWipByStep・
-- 完成数の終端集計はどれも従来どおり成立する（lib/workflow.ts の
-- completeStepExecution のコメント参照 — NONE でも outputSuccess は必ず埋まる）。
--
-- 既に完了した工程に記録済みの数量は**触らない**（履歴なので）。
UPDATE app.process_step_catalog
   SET quantity_tracking = 'NONE'
 WHERE is_approval_step = true
   AND quantity_tracking <> 'NONE';
