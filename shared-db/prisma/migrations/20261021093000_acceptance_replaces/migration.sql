-- 注文請書の「作り直し元」リンク。
--
-- 確定済み（COMPLETED）の請書は明細を編集できない。直したいときの手順は 1 つだけ:
-- ごとキャンセル → その請書から作り直す（キャンセルは配下の未着手指示書も連鎖で
-- 止める）。これまでその 2 通の間に紐付けが無く、キャンセルした請書は指示書も
-- 出荷も無い行き止まりに見えていた。
--
-- 1 対 N（unique にしない）— 1 件を 2 件に割って作り直すことがある。
-- 元が消えても作り直した側は残す（SET NULL）— 紐付けが切れるだけで、作り直した
-- 請書そのものは業務データとして生きている。
--
-- **列を足すだけ**で既存データは 1 行も動かない。旧コンテナはこの列を知らないが
-- NULL 許容なので書き込みも読み出しも壊れない。
--
-- 以下は prisma migrate diff の生成そのまま。

-- AlterTable
ALTER TABLE "app"."order_acceptances" ADD COLUMN     "replaces_seq" INTEGER,
ADD COLUMN     "replaces_year_month" CHAR(6);

-- CreateIndex
CREATE INDEX "order_acceptances_replaces_year_month_replaces_seq_idx" ON "app"."order_acceptances"("replaces_year_month", "replaces_seq");

-- AddForeignKey
ALTER TABLE "app"."order_acceptances" ADD CONSTRAINT "order_acceptances_replaces_year_month_replaces_seq_fkey" FOREIGN KEY ("replaces_year_month", "replaces_seq") REFERENCES "app"."order_acceptances"("year_month", "seq") ON DELETE SET NULL ON UPDATE NO ACTION;

