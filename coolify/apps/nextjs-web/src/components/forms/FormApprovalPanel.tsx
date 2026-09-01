"use client";

import { Alert, Stack, Text } from "@mantine/core";
import { IconInfoCircle } from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import {
  saveFormApprovalFlow,
  searchFormApproverOptions,
} from "@/app/(dashboard)/general/forms/actions";
import { ApprovalFlowEditor } from "@/components/master/approval-flows/ApprovalFlowEditor";
import type { FlowApprover } from "@/components/master/approval-flows/ApproverPermissionBadge";
import { EditablePanel } from "@/components/ui/EditablePanel";
import type { ApprovalMode } from "@/lib/approval-flow";
import { FormFlowSummary } from "./FormFlowSummary";

export interface FormFlowStep {
  nameJa: string;
  nameEn: string;
  /** 日本語以外の翻訳（LocalizedTextInput の多言語ポップアップ初期値）。 */
  nameTranslations: Record<string, string>;
  groupId: string | null;
  mode: ApprovalMode;
  /** カスタム段か（グループが無い段）。 */
  custom?: boolean;
  /** カスタム段の承認者（1..N 人）。グループ段では空。 */
  approvers?: { value: string; label: string; allowed: boolean }[];
}

/**
 * フォームの承認フロー（フォームごと）。
 *
 * 書類共通の 承認設定（MS0B）ではなくここで持つ — フォームは利用者がいくつでも
 * 作るもので、稟議・日報・点検簿が 1 本の承認を共有する理由がないため。
 * 編集画面そのものは MS0B と同じ `ApprovalFlowEditor` を使い、保存先だけ
 * 差し替える（承認グループ・段のモード・承認できる人の表示を作り直さない）。
 */
export function FormApprovalPanel({
  code,
  title,
  approvalEnabled,
  editableUntilFirstApproval,
  initialSteps,
  groupOptions,
  approversByGroup,
  permissionLabel,
  canManage,
}: {
  code: string;
  title: string;
  approvalEnabled: boolean;
  editableUntilFirstApproval: boolean;
  initialSteps: FormFlowStep[];
  groupOptions: { value: string; label: string }[];
  approversByGroup: Record<string, FlowApprover[]>;
  permissionLabel: string;
  canManage: boolean;
}) {
  const tr = useTranslations();
  return (
    <Stack gap="md">
      {!approvalEnabled && (
        <Alert color="yellow" icon={<IconInfoCircle size={16} />}>
          {tr("forms.formApprovalPanel.thisFormIsSetNotTo")}
        </Alert>
      )}

      <Alert color="gray" icon={<IconInfoCircle size={16} />} variant="light">
        <Stack gap={4}>
          <Text size="sm">
            {tr("forms.formApprovalPanel.theApprovalStepsBelongToThis")}
          </Text>
          <Text c="dimmed" size="xs">
            {tr("forms.formApprovalPanel.requestsAlreadyInFlightKeepThe")}
          </Text>
          <Text c="dimmed" size="xs">
            承認依頼中の編集:{" "}
            {editableUntilFirstApproval
              ? tr("forms.formApprovalPanel.theRespondentCanFixItUntil")
              : tr("forms.formApprovalPanel.itClosesTheMomentYouSubmit")}
            。差し戻したときは、設定に関係なく回答者が直せます。
          </Text>
        </Stack>
      </Alert>

      <EditablePanel
        canEdit={canManage}
        edit={({ close }) => (
          <ApprovalFlowEditor
            afterSaveHref={`/general/forms/${code}`}
            allowIndividual
            approversByGroup={approversByGroup}
            embedded
            groupOptions={groupOptions}
            initialSteps={initialSteps}
            onCancel={close}
            onSave={(steps) => saveFormApprovalFlow(code, steps)}
            onSaved={close}
            permissionCode="form"
            permissionLabel={permissionLabel}
            searchApprovers={searchFormApproverOptions}
            targetLabel={title}
            targetType="form_responses"
          />
        )}
        title={tr("forms.formApprovalPanel.approvalStep")}
        view={
          <FormFlowSummary
            approvalEnabled={approvalEnabled}
            approversByGroup={approversByGroup}
            groupOptions={groupOptions}
            steps={initialSteps}
          />
        }
      />

      {!canManage && (
        <Text c="dimmed" size="sm">
          {tr("forms.formApprovalPanel.youDoNotHavePermissionTo")}
        </Text>
      )}
    </Stack>
  );
}
