-- 旧 2 段固定の承認スキーマを撤去する
--
-- 20260908090000_approval_flows で承認フロー（approval_flow_steps）へ
-- 移行し、全呼び出し側が step_no / group_id を使うようになった。
-- 残っていた旧カラムと enum をここで落とす。
--
--   approval_groups.type      — グループの識別と承認のルーティングを兼ねていた。
--                               ルーティングは approval_flow_steps.group_id へ。
--   approval_requests.step    — FIRST / SECOND。step_no（1..N）へ。
--
-- 承認記録（approval_records）は列を持たないので影響なし。

ALTER TABLE "app"."approval_requests" DROP COLUMN "step";
DROP TYPE "app"."APPROVAL_STEP";

ALTER TABLE "app"."approval_groups" DROP COLUMN "type";
DROP TYPE "app"."APPROVAL_GROUP_TYPE";
