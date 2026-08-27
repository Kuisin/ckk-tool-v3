"use client";

import { Alert, Stack, Text } from "@mantine/core";
import { IconInfoCircle } from "@tabler/icons-react";
import {
  saveFormApprovalFlow,
  searchFormApproverOptions,
} from "@/app/(dashboard)/general/forms/actions";
import { ApprovalFlowEditor } from "@/components/master/approval-flows/ApprovalFlowEditor";
import type { FlowApprover } from "@/components/master/approval-flows/ApproverPermissionBadge";
import type { ApprovalMode } from "@/lib/approval-flow";

export interface FormFlowStep {
  nameJa: string;
  nameEn: string;
  groupId: string | null;
  mode: ApprovalMode;
  approverUserId?: string | null;
  approverName?: string | null;
  approverAllowed?: boolean;
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
  return (
    <Stack gap="md">
      {!approvalEnabled && (
        <Alert color="yellow" icon={<IconInfoCircle size={16} />}>
          このフォームは承認フローを使わない設定です。ここで段を作っても動きません
          — 「編集」の基本設定で「承認フローを使う」を有効にしてください。
        </Alert>
      )}

      <Alert color="gray" icon={<IconInfoCircle size={16} />} variant="light">
        <Stack gap={4}>
          <Text size="sm">
            承認の段はこのフォーム専用です。ほかのフォームや書類には影響しません。
          </Text>
          <Text c="dimmed" size="xs">
            進行中の承認依頼は、依頼した時点の段構成のまま進みます（ここを変えても
            途中の依頼は変わりません）。
          </Text>
          <Text c="dimmed" size="xs">
            承認依頼中の編集:{" "}
            {editableUntilFirstApproval
              ? "最初の承認が下りるまでは回答者が直せます"
              : "依頼した時点で締まります"}
            。差し戻したときは、設定に関係なく回答者が直せます。
          </Text>
        </Stack>
      </Alert>

      {canManage ? (
        <ApprovalFlowEditor
          afterSaveHref={`/general/forms/${code}`}
          allowIndividual
          approversByGroup={approversByGroup}
          embedded
          groupOptions={groupOptions}
          initialSteps={initialSteps}
          onSave={(steps) => saveFormApprovalFlow(code, steps)}
          permissionCode="form"
          permissionLabel={permissionLabel}
          searchApprovers={searchFormApproverOptions}
          targetLabel={title}
          targetType="form_responses"
        />
      ) : (
        <Text c="dimmed" size="sm">
          承認フローを変更する権限がありません。
        </Text>
      )}
    </Stack>
  );
}
