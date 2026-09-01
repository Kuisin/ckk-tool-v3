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
import { useState, useTransition } from "react";
import { setApprovalApplyMode } from "@/app/(dashboard)/master/approval-settings/actions";
import { useTr } from "@/hooks/useTr";

export function ApplyModeControl({
  targetType,
  initialMode,
}: {
  targetType: string;
  initialMode: string;
}) {
  const tr = useTr();
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
          title: tr("適用モードを保存しました"),
          message:
            value === "POST"
              ? tr("変更は即時適用され、承認は事後に回ります")
              : tr("変更は承認されるまで保留されます"),
          color: "green",
        });
      } else {
        setMode(prev);
        notifications.show({
          title: tr("エラー"),
          message: tr(result.error),
          color: "red",
        });
      }
    });
  };

  return (
    <Paper p="md" radius="md" shadow="xs">
      <Stack gap="xs">
        <Title order={4}>{tr("適用モード")}</Title>
        <Text c="dimmed" size="xs">
          {tr(
            tr(
              "事前承認 = 承認されるまで変更は保留（既定）。事後承認 =\n          変更を即時適用してから承認を回す（差し戻されても工程は自動では\n          戻りません — 指示書詳細に警告が出ます）。",
            ),
          )}
        </Text>
        <SegmentedControl
          data={[
            { value: "PRE", label: tr("事前承認（承認後に適用）") },
            { value: "POST", label: tr("事後承認（即時適用）") },
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
