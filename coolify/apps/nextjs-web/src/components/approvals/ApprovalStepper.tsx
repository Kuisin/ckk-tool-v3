"use client";

/**
 * ApprovalStepper — 承認フローの進み具合（依頼時のスナップショットから描く）。
 *
 * 段数・名称・グループは approval_requests.flow_snapshot 由来なので、
 * 進行中の書類はあとからフロー定義を編集されても当時の姿のまま表示される。
 */

import { Stepper, Text } from "@mantine/core";
import { useTranslations } from "next-intl";
import {
  type ApprovalPhase,
  stepperActive as computeActive,
} from "@/lib/approval-flow";

export interface ApprovalStepperStep {
  stepNo: number;
  label: string;
  groupLabel: string;
  mode: "ANY" | "ALL";
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
  return (
    <Stepper
      active={computeActive(steps.length, currentStepNo, phase)}
      size="sm"
    >
      {steps.map((s) => (
        <Stepper.Step
          description={
            s.mode === "ALL" ? `${s.groupLabel}（全員承認）` : s.groupLabel
          }
          key={s.stepNo}
          label={s.label}
          loading={phase === "PENDING" && s.stepNo === currentStepNo}
        />
      ))}
    </Stepper>
  );
}
