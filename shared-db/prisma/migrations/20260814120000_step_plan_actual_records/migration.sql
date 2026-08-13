-- 工程の作業計画/実績レコード（分割記録・担当者・日付/時刻）

-- CreateTable
CREATE TABLE "app"."work_order_step_plans" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "work_order_step_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "planned_date" DATE NOT NULL,
    "planned_start_at" TIMESTAMPTZ(6),
    "planned_end_at" TIMESTAMPTZ(6),
    "quantity" INTEGER,
    "notes" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "work_order_step_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."work_order_step_actuals" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "work_order_step_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "worked_date" DATE NOT NULL,
    "started_at" TIMESTAMPTZ(6),
    "ended_at" TIMESTAMPTZ(6),
    "quantity" INTEGER,
    "notes" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "work_order_step_actuals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "work_order_step_plans_work_order_step_id_planned_date_idx" ON "app"."work_order_step_plans"("work_order_step_id", "planned_date");

-- CreateIndex
CREATE INDEX "work_order_step_plans_user_id_planned_date_idx" ON "app"."work_order_step_plans"("user_id", "planned_date");

-- CreateIndex
CREATE INDEX "work_order_step_actuals_work_order_step_id_worked_date_idx" ON "app"."work_order_step_actuals"("work_order_step_id", "worked_date");

-- CreateIndex
CREATE INDEX "work_order_step_actuals_user_id_worked_date_idx" ON "app"."work_order_step_actuals"("user_id", "worked_date");

-- AddForeignKey
ALTER TABLE "app"."work_order_step_plans" ADD CONSTRAINT "work_order_step_plans_work_order_step_id_fkey" FOREIGN KEY ("work_order_step_id") REFERENCES "app"."work_order_steps"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."work_order_step_plans" ADD CONSTRAINT "work_order_step_plans_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."work_order_step_plans" ADD CONSTRAINT "work_order_step_plans_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "app"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."work_order_step_actuals" ADD CONSTRAINT "work_order_step_actuals_work_order_step_id_fkey" FOREIGN KEY ("work_order_step_id") REFERENCES "app"."work_order_steps"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."work_order_step_actuals" ADD CONSTRAINT "work_order_step_actuals_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."work_order_step_actuals" ADD CONSTRAINT "work_order_step_actuals_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "app"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

