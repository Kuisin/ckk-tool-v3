"use client";

/**
 * StepInspectionApprovalPanel.tsx — 検査承認工程（is_approval_step）で、
 * **指示書全体**の検査記録を並べて合格分を承認する（キオスク版）。
 *
 * nextjs-web の InspectionApprovalPanel と同じ業務規則。承認できるかどうかは
 * 検査表の設定（承認グループ / 名指しの承認者）で人ごとに変わるので、
 * サーバーが記録ごとに `canApprove` を解いて渡す — 画面は押せるかどうかを
 * 自分で判断しない（判定が 2 か所に増えると必ず食い違う）。
 *
 * タブレット向け縦積み・size="lg"。押せない記録はボタンを出さず、
 * 合格していない / 承認者ではない のどちらなのかを文字で出す。
 */

import { Alert, Badge, Button, Group, Paper, Stack, Text } from "@mantine/core";
import { IconAlertTriangle, IconCheck } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { fillMessage } from "@/lib/i18n";
import type { ApprovableInspectionRecord } from "@/lib/inspection-approval";
import { useI18n } from "../I18nProvider";
import { callStepAction, translateError } from "./step-ui";

function statusColor(status: string): string {
  switch (status) {
    case "PASS":
      return "green";
    case "FAIL":
      return "red";
    case "APPROVED":
      return "teal";
    default:
      return "gray";
  }
}

type Props = {
  stepId: string;
  records: ApprovableInspectionRecord[];
  /** 作業中 / 一時停止中のみ true（それ以外は読み取り専用）。 */
  canApprove: boolean;
};

export function StepInspectionApprovalPanel({
  stepId,
  records,
  canApprove,
}: Props) {
  const router = useRouter();
  const { m, locale } = useI18n();
  const t = m.steps.approval;
  const statusTable = m.steps.inspection.status as Record<string, string>;
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [approved, setApproved] = useState(false);

  const fmtAt = (iso: string) =>
    new Intl.DateTimeFormat(locale === "en" ? "en-US" : "ja-JP", {
      timeZone: "Asia/Tokyo",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));

  const approve = async (recordId: string) => {
    setBusyId(recordId);
    setError(null);
    setApproved(false);
    const res = await callStepAction(stepId, {
      action: "INSPECTION_APPROVE",
      recordId,
    });
    setBusyId(null);
    if (!res.ok) {
      setError(translateError(m, res));
      router.refresh(); // 競合（他の人が先に承認した等）は最新を出し直す
      return;
    }
    setApproved(true);
    router.refresh();
  };

  return (
    <Paper p="md" radius="md" withBorder>
      <Stack gap="md">
        <Text fw={600} size="lg">
          {t.title}
        </Text>

        {error && (
          <Alert color="red" icon={<IconAlertTriangle size={20} />}>
            {error}
          </Alert>
        )}
        {approved && (
          <Alert color="green" icon={<IconCheck size={20} />}>
            {t.approved}
          </Alert>
        )}

        {records.length === 0 ? (
          <Text c="dimmed">{t.empty}</Text>
        ) : (
          <Stack gap="sm">
            {records.map((r) => (
              <Paper key={r.id} p="sm" radius="sm" withBorder>
                <Stack gap={6}>
                  <Group gap="sm" wrap="wrap">
                    <Text fw={600}>{r.stepName}</Text>
                    <Text>{r.templateName}</Text>
                    <Badge
                      color={statusColor(r.status)}
                      size="md"
                      variant="light"
                    >
                      {statusTable[r.status] ?? r.status}
                    </Badge>
                  </Group>
                  {r.recordedAt && (
                    <Text c="dimmed" size="sm">
                      {fillMessage(t.recordedBy, {
                        at: fmtAt(r.recordedAt),
                        by: r.recordedByName ?? "",
                      })}
                    </Text>
                  )}
                  {r.approvedAt ? (
                    <Text c="dimmed" size="sm">
                      {fillMessage(t.approvedMeta, {
                        at: fmtAt(r.approvedAt),
                        by: r.approvedByName ?? "",
                      })}
                    </Text>
                  ) : (
                    canApprove &&
                    (r.canApprove ? (
                      <Button
                        color="green"
                        fullWidth
                        leftSection={<IconCheck size={20} />}
                        loading={busyId === r.id}
                        onClick={() => approve(r.id)}
                        size="lg"
                      >
                        {t.approve}
                      </Button>
                    ) : (
                      // 押せない理由を出す — 灰色のボタンが並ぶだけでは、
                      // 不合格なのか自分が承認者でないのか分からない。
                      <Text c="dimmed" size="sm">
                        {r.status === "PASS" ? t.notApprover : t.onlyPass}
                      </Text>
                    ))
                  )}
                </Stack>
              </Paper>
            ))}
          </Stack>
        )}
      </Stack>
    </Paper>
  );
}
