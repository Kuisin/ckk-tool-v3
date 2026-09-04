"use client";

/**
 * ApprovalStepper — 承認フローの進み具合（依頼時のスナップショットから描く）。
 *
 * 段数・名称・グループは approval_requests.flow_snapshot 由来なので、
 * 進行中の書類はあとからフロー定義を編集されても当時の姿のまま表示される。
 *
 * 見た目は手続き状況（ProcedurePanel §12.10）と同じ `ProcedureStepper` を通す
 * — 承認が「書類の 1 段」として出るときと、承認だけを見るときとで、済んだ段の
 * アイコンが違って見えないように。
 */

import { Text } from "@mantine/core";
import { useTranslations } from "next-intl";
import { ProcedureStepper } from "@/components/ui/ProcedurePanel";
import type { ApprovalPhase } from "@/lib/approval-flow";
import { procedureStages } from "@/lib/procedure-stage";

export interface ApprovalStepperStep {
  stepNo: number;
  label: string;
  groupLabel: string;
  mode: "ANY" | "ALL";
}

/**
 * phase → いま留まっている段の index。
 *
 *   NONE      まだ依頼が出ていない = どの段にも入っていない（-1）
 *   PENDING   その段で承認を待っている
 *   APPROVED  全段が済んだ
 *   REJECTED  差し戻された段で止まった（以降は skipped）
 */
function currentStage(
  currentStepNo: number,
  phase: ApprovalPhase,
  stepCount: number,
): number {
  if (phase === "NONE") return -1;
  if (phase === "APPROVED") return stepCount;
  return currentStepNo - 1;
}

export function ApprovalStepper({
  steps,
  currentStepNo,
  phase,
}: {
  steps: ApprovalStepperStep[];
  currentStepNo: number;
  phase: ApprovalPhase;
}) {
  const tr = useTranslations();
  if (steps.length === 0) {
    return (
      <Text c="dimmed" size="sm">
        {tr("approvals.approvalStepper.noApprovalFlowIsSet")}
      </Text>
    );
  }
  const stages = procedureStages(
    steps.map((s) => ({
      key: String(s.stepNo),
      label: s.label,
      description:
        s.mode === "ALL"
          ? tr("approvals.approvalStepper.groupAllMustApprove", {
              group: s.groupLabel,
            })
          : s.groupLabel,
      // 差し戻された段は赤（_specs/design.md §9 REJECTED = red）。
      color:
        phase === "REJECTED" && s.stepNo === currentStepNo ? "red" : undefined,
    })),
    currentStage(currentStepNo, phase, steps.length),
    { stopped: phase === "REJECTED" },
  );
  return <ProcedureStepper stages={stages} />;
}
