-- 外注の預け在庫（在庫の記録漏れ 4 件のうちの 1 つ）。
--
-- いまは「外注先がいま何を持っているか」に誰も答えられない。外注工程が持って
-- いるのは 依頼日 / 入荷予定日 / 入荷日 の 3 列だけで、物が出て行ったことも
-- 戻ったことも台帳には 1 行も残らない（saveOutsourceDates は lib/inventory を
-- 読み込んでさえいない）。
--
-- ## 預け在庫は「自社在庫の別の置き場」ではない
--
-- 仕掛品はそもそも台帳に無い（在庫が動くのは全工程完了時だけ）。だから
-- 外注へ出すときに自社在庫から引ける行は無く、**引き算の相手がいない**。
-- ここで無理に「拠点 → 外注先」の移動として書くと、出したことのない在庫を
-- 出したことにしてしまう。
--
-- そこで預け在庫は **item_inventory の中の別のバケット**として持ち、
-- `custody_bp_id`（預け先）が入っている行は**自社在庫として数えない**。
--   - 出し … 預けバケットへ IN（事由 OUTSOURCE_ISSUE）
--   - 戻り … 預けバケットから OUT（事由 OUTSOURCE_RETURN）
-- 台帳としては閉じており、「誰が何本持っているか」はこの 2 つの差で読める。
--
-- 自社在庫の側から外すのは**読み出しの責任**（`custody_bp_id IS NULL`）。
-- 付け忘れると預けた品が出荷できてしまうので、nextjs-web の
-- inventory-custody-scope.test.ts が全クエリを走査して止める。
-- analytics-views.sql / grants.sql は毎デプロイ流し直されるので、
-- そちら（v_item_inventory 等）も同じ条件を持つ。

-- ── 事由を 2 つ足す（増やすだけ。旧アプリは読まない値が増えるだけ）──────────
ALTER TYPE "app"."INVENTORY_MOVEMENT_CAUSE" ADD VALUE IF NOT EXISTS 'OUTSOURCE_ISSUE';
ALTER TYPE "app"."INVENTORY_MOVEMENT_CAUSE" ADD VALUE IF NOT EXISTS 'OUTSOURCE_RETURN';

-- ── 預け先 ─────────────────────────────────────────────────────────────────
ALTER TABLE "app"."item_inventory" ADD COLUMN "custody_bp_id" UUID;

ALTER TABLE "app"."item_inventory"
  ADD CONSTRAINT "item_inventory_custody_bp_id_fkey"
  FOREIGN KEY ("custody_bp_id") REFERENCES "app"."business_partners"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "item_inventory_custody_bp_id_idx" ON "app"."item_inventory"("custody_bp_id");

-- バケットの一意キーに預け先を足す。**NULLS NOT DISTINCT のまま** —
-- 既存行は全部 NULL なので、いまある行の一意性は 1 ミリも変わらない。
-- 足さないと「自社の未割当バケット」と「外注 A の預けバケット」が同じ行に
-- なってしまい、預けた瞬間に自社在庫が増える。
DROP INDEX "app"."item_inventory_bucket_key";
CREATE UNIQUE INDEX "item_inventory_bucket_key"
  ON "app"."item_inventory" ("item_id", "plant_id", "lot_number", "is_semi_finished", "storage_location_id", "shelf_id", "custody_bp_id")
  NULLS NOT DISTINCT;

-- ── 二度計上しないための印（伝票へのリンクを兼ねる）─────────────────────────
-- 日付の有無で判断すると、日付を直すたびに預け在庫が増える。
ALTER TABLE "app"."work_order_steps"
  ADD COLUMN "outsource_issue_movement_id" UUID,
  ADD COLUMN "outsource_return_movement_id" UUID;

ALTER TABLE "app"."work_order_steps"
  ADD CONSTRAINT "work_order_steps_outsource_issue_movement_id_fkey"
  FOREIGN KEY ("outsource_issue_movement_id") REFERENCES "app"."inventory_movements"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "app"."work_order_steps"
  ADD CONSTRAINT "work_order_steps_outsource_return_movement_id_fkey"
  FOREIGN KEY ("outsource_return_movement_id") REFERENCES "app"."inventory_movements"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
