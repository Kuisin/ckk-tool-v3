"use client";

/**
 * CustomValueOverview — 「独自値の追加承認」の一覧（承認設定 MS0B のタブ）。
 *
 * 通常の承認フローとは別建てで、書類に前の書類から引き継いでいない値（独自値）
 * があるときだけ、通常の段の後ろに足す段。1 書類 = 1 枚のカードで、何を独自値と
 * 数えるかの説明と段を並べる。**未設定は正常**（追加の承認なし）なので、
 * 通常のフローの一覧と違って赤くしない。
 */

import { Badge, Group, Paper, Stack, Text } from "@mantine/core";
import { IconArrowRight } from "@tabler/icons-react";
import { useLocale, useTranslations } from "next-intl";
import { EditButton } from "@/components/ui/buttons";
import { useIsMobile } from "@/hooks/useViewport";
import {
  APPROVAL_TARGET,
  type ApprovalTargetType,
} from "@/lib/approval-targets";
import { approvalModeLabel } from "@/lib/enum-labels";
import type { FlowOverviewStep } from "./ApprovalFlowOverview";
import { ApproverPermissionBadge } from "./ApproverPermissionBadge";

const BASE_PATH = "/master/approval-settings";

export interface CustomValueOverviewRow {
  targetType: ApprovalTargetType;
  /** この書類で何を独自値と数えるか。 */
  description: string;
  steps: FlowOverviewStep[];
}

export function CustomValueOverview({
  rows,
}: {
  rows: CustomValueOverviewRow[];
}) {
  const tr = useTranslations();
  const locale = useLocale();
  const isMobile = useIsMobile();
  return (
    <Stack gap="sm">
      <Text c="dimmed" size="sm">
        {tr("master.customValueApproval.overviewIntro")}
      </Text>
      {rows.map((r) => {
        const meta = APPROVAL_TARGET[r.targetType];
        const empty = r.steps.length === 0;
        return (
          <Paper key={r.targetType} p="md" radius="md" withBorder>
            <Group
              align="flex-start"
              justify="space-between"
              wrap={isMobile ? "wrap" : "nowrap"}
            >
              <Stack className="min-w-0 flex-1" gap="xs">
                <Group gap="xs">
                  <Badge color={meta.color} size="sm" variant="light">
                    {meta.label}
                  </Badge>
                  {empty && (
                    <Text c="dimmed" size="xs">
                      {tr("master.customValueApproval.notSet")}
                    </Text>
                  )}
                </Group>
                <Text c="dimmed" size="xs">
                  {r.description}
                </Text>
                {!empty && (
                  <Group gap="xs" wrap="wrap">
                    {r.steps.map((s, i) => (
                      <Group gap="xs" key={s.stepNo} wrap="nowrap">
                        {i > 0 && (
                          <IconArrowRight
                            color="var(--mantine-color-dimmed)"
                            size={14}
                          />
                        )}
                        <Badge color="grape" size="sm" variant="outline">
                          +{s.stepNo}
                        </Badge>
                        <Text fw={500} size="sm">
                          {s.label}
                        </Text>
                        <Text c="dimmed" size="xs">
                          {s.groupLabel} ·{" "}
                          {approvalModeLabel(s.mode, locale) ?? s.mode}
                        </Text>
                        <ApproverPermissionBadge approvers={s.approvers} />
                      </Group>
                    ))}
                  </Group>
                )}
              </Stack>
              <EditButton
                fullWidth={isMobile}
                href={`${BASE_PATH}/custom-values/${r.targetType}`}
              >
                {empty ? tr("common.settings") : tr("common.edit2")}
              </EditButton>
            </Group>
          </Paper>
        );
      })}
    </Stack>
  );
}
