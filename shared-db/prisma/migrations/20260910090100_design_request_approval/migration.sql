-- 設計依頼書 (SA06) に承認フローを入れる — その 2: 列・依頼区分・承認対象の登録。
--
-- 前の migration（20260910090000_design_status_values）で足した DESIGN_STATUS の
-- 新しい値をここで初めて使う（status の DEFAULT を DRAFT へ）。値の追加と別
-- トランザクションでなければならないので、2 ファイルに分けてある。
--
-- 形は購買依頼（purchase_requests）に合わせた row-workflow:
--   下書き → 承認依頼 → 承認 → 着手 → 完了（+ 差し戻し / キャンセル）
-- 加えて assignee_id（図面をつくる製造担当）を持つ。§10 の「依頼通知を製造担当へ」
-- は、この列で宛先が定まってはじめて実装できる。

-- ─── 依頼区分・優先度 ────────────────────────────────────────────────────────
-- CREATE TYPE は同一トランザクション内で使ってよい（使えないのは既存 enum への
-- ADD VALUE。そちらは前の migration に分けてある）。
CREATE TYPE "app"."DESIGN_KIND" AS ENUM ('NEW', 'REVISION');
CREATE TYPE "app"."DESIGN_PRIORITY" AS ENUM ('NORMAL', 'HIGH');

-- ─── 列の追加 ────────────────────────────────────────────────────────────────
ALTER TABLE "app"."design_requests"
  ADD COLUMN "assignee_id"   uuid,
  ADD COLUMN "requested_at"  timestamptz(6),
  ADD COLUMN "requested_by"  uuid,
  ADD COLUMN "approved_at"   timestamptz(6),
  ADD COLUMN "approved_by"   uuid,
  ADD COLUMN "started_at"    timestamptz(6),
  ADD COLUMN "completed_by"  uuid,
  ADD COLUMN "cancelled_at"  timestamptz(6),
  ADD COLUMN "cancelled_by"  uuid,
  ADD COLUMN "cancel_reason" text,
  -- 状態遷移履歴 [{ action, user, at, notes }]（purchase_requests.history と同型）
  ADD COLUMN "history"       jsonb,
  -- 依頼区分（新規 / 改訂）。作成時に「その製品に design_files があるか」で
  -- 自動判定して保存する。**導出値にしない** — 区分は承認ルートを決めるので
  -- （MS0B の条件）、他の依頼が先に完了した瞬間に値が変わると、承認済みの
  -- ルートと食い違う。flow_snapshot を持っているのと同じ理由。
  ADD COLUMN "kind"            "app"."DESIGN_KIND" NOT NULL DEFAULT 'NEW',
  ADD COLUMN "kind_overridden" boolean NOT NULL DEFAULT false,
  -- 改訂の元図面（既定 = 起票時点の最新版）。新規のときは null。
  ADD COLUMN "base_design_file_id" uuid,
  -- 改訂のときだけ必須（「なぜ描き直すか」を依頼内容とは別に残す）。
  ADD COLUMN "change_reason"   text,
  ADD COLUMN "desired_at"      date,
  ADD COLUMN "priority"        "app"."DESIGN_PRIORITY" NOT NULL DEFAULT 'NORMAL';

-- 既存行の区分を、アプリと同じ規則で埋める。
-- product_id が NULL の行は df.product_id = NULL が真にならないので NEW のまま。
UPDATE "app"."design_requests" dr
   SET "kind" = 'REVISION'::"app"."DESIGN_KIND"
 WHERE EXISTS (
   SELECT 1 FROM "app"."design_files" df WHERE df."product_id" = dr."product_id"
 );

ALTER TABLE "app"."design_requests"

-- 新規は下書きから始まる。既存行（PENDING / IN_PROGRESS / COMPLETED）はそのまま —
-- PENDING は「承認済・着手待ち」として意味を引き継ぐので移行は不要。
ALTER TABLE "app"."design_requests"
  ALTER COLUMN "status" SET DEFAULT 'DRAFT'::app."DESIGN_STATUS";

-- ─── 外部キー ────────────────────────────────────────────────────────────────
ALTER TABLE "app"."design_requests" ADD CONSTRAINT "design_requests_assignee_id_fkey"
  FOREIGN KEY ("assignee_id") REFERENCES "app"."users"("id") ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE "app"."design_requests" ADD CONSTRAINT "design_requests_requested_by_fkey"
  FOREIGN KEY ("requested_by") REFERENCES "app"."users"("id") ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE "app"."design_requests" ADD CONSTRAINT "design_requests_approved_by_fkey"
  FOREIGN KEY ("approved_by") REFERENCES "app"."users"("id") ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE "app"."design_requests" ADD CONSTRAINT "design_requests_completed_by_fkey"
  FOREIGN KEY ("completed_by") REFERENCES "app"."users"("id") ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE "app"."design_requests" ADD CONSTRAINT "design_requests_cancelled_by_fkey"
  FOREIGN KEY ("cancelled_by") REFERENCES "app"."users"("id") ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE "app"."design_requests" ADD CONSTRAINT "design_requests_base_design_file_id_fkey"
  FOREIGN KEY ("base_design_file_id") REFERENCES "app"."design_files"("id") ON UPDATE CASCADE ON DELETE SET NULL;

-- 担当者の「自分あての設計依頼」を引くための索引。
CREATE INDEX "design_requests_assignee_id_status_idx"
  ON "app"."design_requests"("assignee_id", "status");

-- 希望納期での並べ替え・遅延の抽出。
CREATE INDEX "design_requests_desired_at_idx"
  ON "app"."design_requests"("desired_at");

-- ─── 承認対象の追加 ──────────────────────────────────────────────────────────
-- 張り替えないと MS0B（承認設定）で設計依頼書のフローを作れない。
-- 前例: 20260905090000_internal_pages/migration.sql
ALTER TABLE "app"."approval_flows" DROP CONSTRAINT IF EXISTS "approval_flows_target_type_check";
ALTER TABLE "app"."approval_flows" ADD CONSTRAINT "approval_flows_target_type_check"
  CHECK (target_type = ANY (ARRAY[
    'work_orders'::text,
    'order_acceptances'::text,
    'material_purchase_orders'::text,
    'purchase_requests'::text,
    'work_order_flow_changes'::text,
    'order_acceptance_cancel_requests'::text,
    'form_responses'::text,
    'internal_pages'::text,
    'design_requests'::text
  ]));
