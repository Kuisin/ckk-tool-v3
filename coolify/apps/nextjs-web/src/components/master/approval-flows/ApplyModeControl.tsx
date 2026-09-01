"use client";

/**
 * ApplyModeControl — 承認フローの適用モード（approval_flows.apply_mode）。
 *
 * PRE（既定）= 承認後に適用（承認されるまで変更は保留） /
 * POST = 即時適用 + 事後承認（変更をその場で当ててから承認を回す —
 * 現場を止めない運用。差し戻されても自動では戻らず、指示書詳細に赤警告）。
 * 対応 target（現状 工程フロー変更のみ）でだけ表示される。変更は即保存。
 */

import { Paper, SegmentedControl, Stack, Text, Title } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { setApprovalApplyMode } from "@/app/(dashboard)/master/approval-settings/actions";

export function ApplyModeControl({
  targetType,
  initialMode,
}: {
  targetType: string;
  initialMode: string;
}) {
  const tr = useTranslations();
  const [isPending, startTransition] = useTransition();
  const [mode, setMode] = useState(initialMode === "POST" ? "POST" : "PRE");

  const handleChange = (next: string) => {
    const value = next === "POST" ? "POST" : "PRE";
    const prev = mode;
    setMode(value);
    startTransition(async () => {
      const result = await setApprovalApplyMode(targetType, value);
      if (result.ok) {
        notifications.show({
          title: tr("master.approvalFlows.theApplyModeWasSaved"),
          message:
            value === "POST"
              ? tr(
                  "master.approvalFlows.theChangeAppliesImmediatelyApprovalFollows",
                )
              : tr("master.approvalFlows.theChangeIsHeldUntilIt"),
          color: "green",
        });
      } else {
        setMode(prev);
        notifications.show({
          title: tr("common.error2"),
          message: result.error,
          color: "red",
        });
      }
    });
  };

  return (
    <Paper p="md" radius="md" shadow="xs">
      <Stack gap="xs">
        <Title order={4}>{tr("master.approvalFlows.applyMode")}</Title>
        <Text c="dimmed" size="xs">
          {tr("master.approvalFlows.approveFirstTheChangeIsHeld")}
        </Text>
        <SegmentedControl
          data={[
            {
              value: "PRE",
              label: tr(
                "master.approvalFlows.approveFirstAppliedAfterApproval",
              ),
            },
            {
              value: "POST",
              label: tr(
                "master.approvalFlows.approveAfterwardsAppliedImmediately",
              ),
            },
          ]}
          disabled={isPending}
          onChange={handleChange}
          value={mode}
          w="fit-content"
        />
      </Stack>
    </Paper>
  );
}
