"use client";

/**
 * FormFlowSummary — フォームの承認フローを読む形で出す（承認タブの閲覧モード）。
 *
 * 段を「1 第一承認 · 工場長 · いずれか1名」の 1 行で並べる。承認設定 MS0B の
 * ApprovalFlowOverview と見え方を揃えているが、あちらは書類種別ごとのカードと
 * MS0B への編集リンクを持つ専用部品なので流用せず、ここは薄く書く。
 *
 * **段が 0 のときは警告色で出す。** 申請・報告フォームは提出がそのまま承認依頼に
 * なる（actions.ts の autoRequestApproval）ので、未設定だと提出しても誰にも
 * 気づかれないまま止まる。手動の承認依頼ボタンは無いので、気づける場所はここ。
 */

import { Alert, Badge, Group, Paper, Stack, Text } from "@mantine/core";
import { IconAlertTriangle, IconArrowRight } from "@tabler/icons-react";
import { useLocale } from "next-intl";
import {
  ApproverPermissionBadge,
  type FlowApprover,
} from "@/components/master/approval-flows/ApproverPermissionBadge";
import { useTr } from "@/hooks/useTr";
import { approvalModeLabel } from "@/lib/enum-labels";
import type { FormFlowStep } from "./FormApprovalPanel";

export function FormFlowSummary({
  steps,
  approvalEnabled,
  groupOptions,
  approversByGroup,
}: {
  steps: FormFlowStep[];
  approvalEnabled: boolean;
  groupOptions: { value: string; label: string }[];
  approversByGroup: Record<string, FlowApprover[]>;
}) {
  const tr = useTr();
  const locale = useLocale();
  if (steps.length === 0) {
    return (
      <Alert
        color={approvalEnabled ? "orange" : "gray"}
        icon={<IconAlertTriangle size={16} />}
      >
        {approvalEnabled
          ? tr(
              tr(
                tr(
                  "承認の段がまだありません。このままだと提出しても承認依頼が始まらず、回答は「提出済」で止まります。「編集」から段を追加してください。",
                ),
              ),
            )
          : tr("承認の段はまだありません。")}
      </Alert>
    );
  }

  const groupLabel = (id: string | null) =>
    id
      ? (groupOptions.find((o) => o.value === id)?.label ?? tr("（不明）"))
      : null;

  return (
    <Stack gap="xs">
      {steps.map((step, i) => {
        // カスタム段は段専用の承認者、グループ段はグループの現メンバー。
        const approvers: FlowApprover[] = step.groupId
          ? (approversByGroup[step.groupId] ?? [])
          : (step.approvers ?? []).map((a) => ({
              userId: a.value,
              displayName: a.label,
              allowed: a.allowed,
              unrestricted: a.allowed,
              scopes: [],
            }));
        const target = step.groupId
          ? groupLabel(step.groupId)
          : (step.approvers ?? []).map((a) => a.label).join("、") ||
            tr("承認者が未設定");
        return (
          <Paper
            // 段は並び順そのものが同一性（保存のたびに作り直される）。
            // biome-ignore lint/suspicious/noArrayIndexKey: 並び順が同一性
            key={i}
            p="sm"
            radius="sm"
            withBorder
          >
            <Group gap="xs" wrap="wrap">
              <Badge color="gray" variant="light">
                {i + 1}
              </Badge>
              <Text fw={600} size="sm">
                {step.nameJa || `第 ${i + 1} 承認`}
              </Text>
              <IconArrowRight size={14} />
              <Text size="sm">{target}</Text>
              <Text c="dimmed" size="xs">
                {approvalModeLabel(step.mode, locale) ?? step.mode}
              </Text>
              <ApproverPermissionBadge approvers={approvers} />
            </Group>
          </Paper>
        );
      })}
    </Stack>
  );
}
