-- 条件付き承認フロー（書類の属性でフローを分岐するルール）
--   1. approval_flow_rules — 書類種別ごとの分岐ルール（priority 昇順で評価、
--      最初に一致した 1 本を適用。conditions Json = [{ field, op, value }] AND）。
--   2. approval_flow_rule_steps — ルールの段（approval_flow_steps と同型）。
--   進行中の依頼は flow_snapshot で固定されるため、ルールは依頼時にだけ効く。

-- CreateTable
CREATE TABLE "app"."approval_flow_rules" (
    "id" SERIAL NOT NULL,
    "target_type" TEXT NOT NULL,
    "name" JSONB NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "conditions" JSONB NOT NULL,
    "updated_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "approval_flow_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."approval_flow_rule_steps" (
    "id" SERIAL NOT NULL,
    "rule_id" INTEGER NOT NULL,
    "step_no" INTEGER NOT NULL,
    "name" JSONB NOT NULL,
    "group_id" INTEGER NOT NULL,
    "mode" "app"."APPROVAL_MODE" NOT NULL DEFAULT 'ANY',

    CONSTRAINT "approval_flow_rule_steps_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "approval_flow_rules_target_type_priority_idx"
    ON "app"."approval_flow_rules"("target_type", "priority");

-- CreateIndex
CREATE UNIQUE INDEX "approval_flow_rule_steps_rule_id_step_no_key"
    ON "app"."approval_flow_rule_steps"("rule_id", "step_no");

-- CreateIndex
CREATE INDEX "approval_flow_rule_steps_group_id_idx"
    ON "app"."approval_flow_rule_steps"("group_id");

-- AddForeignKey
ALTER TABLE "app"."approval_flow_rules"
    ADD CONSTRAINT "approval_flow_rules_target_type_fkey" FOREIGN KEY ("target_type")
    REFERENCES "app"."approval_flows"("target_type") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."approval_flow_rules"
    ADD CONSTRAINT "approval_flow_rules_updated_by_fkey" FOREIGN KEY ("updated_by")
    REFERENCES "app"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."approval_flow_rule_steps"
    ADD CONSTRAINT "approval_flow_rule_steps_rule_id_fkey" FOREIGN KEY ("rule_id")
    REFERENCES "app"."approval_flow_rules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."approval_flow_rule_steps"
    ADD CONSTRAINT "approval_flow_rule_steps_group_id_fkey" FOREIGN KEY ("group_id")
    REFERENCES "app"."approval_groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
