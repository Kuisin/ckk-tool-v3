"use client";

/**
 * CustomValueStepsEditor — 「独自値の追加承認」の段を並べる編集画面（MS0B）。
 *
 * 通常の承認フローとは**別建て**の段構成で、書類に前の書類から引き継いでいない
 * 値（独自値）があるときだけ、通常の段の後ろに足される
 * （lib/custom-value-approval-core.ts）。段の並べ方・承認グループ・モードは
 * 通常のフローと同じなので、編集部品は ApprovalFlowEditor をそのまま使い、
 * 保存先だけを差し替える。0 段で保存すると追加の承認が無くなる。
 */

import { Alert, Stack, Text } from "@mantine/core";
import { IconInfoCircle } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { saveCustomValueSteps } from "@/app/(dashboard)/master/approval-settings/actions";
import { PageHeader } from "@/components/ui/PageHeader";
import { ApprovalFlowEditor, type FlowEditorStep } from "./ApprovalFlowEditor";
import type { FlowApprover } from "./ApproverPermissionBadge";

const BASE_PATH = "/master/approval-settings";

export function CustomValueStepsEditor({
  targetType,
  targetLabel,
  description,
  hasBaseFlow,
  initialSteps,
  groupOptions,
  approversByGroup,
  permissionCode,
  permissionLabel,
}: {
  targetType: string;
  targetLabel: string;
  /** この書類で何を独自値と数えるか。 */
  description: string;
  /** 通常のフローを持つ書類か（価格表は持たない）。 */
  hasBaseFlow: boolean;
  initialSteps: Omit<FlowEditorStep, "key">[];
  groupOptions: { value: string; label: string }[];
  approversByGroup: Record<string, FlowApprover[]>;
  permissionCode: string;
  permissionLabel: string;
}) {
  const tr = useTranslations();
  const router = useRouter();
  return (
    <Stack gap="md">
      <PageHeader
        breadcrumbs={[
          tr("common.masterData"),
          { label: tr("common.approvalSettings"), href: BASE_PATH },
          tr("master.customValueApproval.title"),
        ]}
        title={tr("master.customValueApproval.titleFor", {
          label: targetLabel,
        })}
      />
      <Alert color="blue" icon={<IconInfoCircle size={16} />} variant="light">
        <Stack gap={4}>
          <Text size="sm">
            {hasBaseFlow
              ? tr("master.customValueApproval.appendedAfterBaseFlow")
              : tr("master.customValueApproval.onlyLayerForThisDocument")}
          </Text>
          <Text size="sm">{description}</Text>
          <Text c="dimmed" size="xs">
            {tr("master.customValueApproval.emptyMeansNoExtraApproval")}
          </Text>
        </Stack>
      </Alert>
      <ApprovalFlowEditor
        allowEmpty
        approversByGroup={approversByGroup}
        embedded
        groupOptions={groupOptions}
        initialSteps={initialSteps}
        onCancel={() => router.push(BASE_PATH)}
        onSave={(steps) =>
          saveCustomValueSteps(
            targetType,
            steps.flatMap((s) =>
              s.groupId == null
                ? []
                : [
                    {
                      nameJa: s.nameJa,
                      nameTranslations: s.nameTranslations,
                      groupId: s.groupId,
                      mode: s.mode,
                    },
                  ],
            ),
          )
        }
        permissionCode={permissionCode}
        permissionLabel={permissionLabel}
        targetLabel={targetLabel}
        targetType={targetType}
      />
    </Stack>
  );
}
