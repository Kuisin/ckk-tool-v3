"use client";

/**
 * FormTasksPanel — 承認・予定 (CM01) のフォームセクション。
 *
 * 「自分が答えるべきもの」と「自分が出したもの」を並べる。回答者を表示しない
 * フォームでも、自分の回答は自分に見える（他人には出ない）。
 */

import { Badge, Group, Paper, Stack, Text } from "@mantine/core";
import { IconForms } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import type {
  MyResponseRow,
  PendingFormRow,
} from "@/app/(dashboard)/general/tasks/forms-data";
import { useFormat } from "@/components/layout/PreferencesProvider";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useIsMobile } from "@/hooks/useViewport";

function Row({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Paper
      onClick={onClick}
      p="sm"
      radius="sm"
      style={{ cursor: "pointer" }}
      withBorder
    >
      {children}
    </Paper>
  );
}

export function PendingFormsList({ rows }: { rows: PendingFormRow[] }) {
  const router = useRouter();
  const fmt = useFormat();
  const isMobile = useIsMobile();

  if (rows.length === 0) {
    return (
      <Paper p="md" radius="md" withBorder>
        <EmptyState
          icon={<IconForms size={28} />}
          message="回答待ちのフォームはありません"
        />
      </Paper>
    );
  }

  return (
    <Stack gap="xs">
      {rows.map((row) => (
        <Row key={row.code} onClick={() => router.push(`/f/${row.code}`)}>
          <Group justify="space-between" wrap={isMobile ? "wrap" : "nowrap"}>
            <Group gap="sm" style={{ minWidth: 0 }} wrap="nowrap">
              <Text fw={600} size="sm" truncate>
                {row.title}
              </Text>
              <Badge
                color={row.kind === "REQUEST" ? "indigo" : "cyan"}
                size="sm"
                variant="light"
              >
                {row.kind === "REQUEST" ? "申請・報告" : "アンケート"}
              </Badge>
            </Group>
            <Text c="dimmed" size="xs" style={{ flexShrink: 0 }}>
              {row.closesAt ? `${fmt.dateTime(row.closesAt)} まで` : "期限なし"}
            </Text>
          </Group>
        </Row>
      ))}
    </Stack>
  );
}

export function MyResponsesList({ rows }: { rows: MyResponseRow[] }) {
  const router = useRouter();
  const fmt = useFormat();
  const isMobile = useIsMobile();

  if (rows.length === 0) {
    return (
      <Paper p="md" radius="md" withBorder>
        <EmptyState
          icon={<IconForms size={28} />}
          message="まだフォームに回答していません"
        />
      </Paper>
    );
  }

  return (
    <Stack gap="xs">
      {rows.map((row) => (
        <Row
          key={row.responseNumber}
          onClick={() =>
            router.push(
              `/general/forms/${row.formCode}/responses/${row.responseNumber}`,
            )
          }
        >
          <Group justify="space-between" wrap={isMobile ? "wrap" : "nowrap"}>
            <Group gap="sm" style={{ minWidth: 0 }} wrap="nowrap">
              <Text fw={600} size="sm" truncate>
                {row.formTitle}
              </Text>
              <Text c="dimmed" className="tabular-nums" size="xs">
                No. {row.recordNo}
              </Text>
              <StatusBadge entity="FormResponse" status={row.status} />
            </Group>
            <Group gap="xs" style={{ flexShrink: 0 }}>
              {row.canEdit && (
                <Badge color="blue" size="sm" variant="light">
                  {row.editDeadline
                    ? `${fmt.dateTime(row.editDeadline)} まで編集可`
                    : "編集可"}
                </Badge>
              )}
              <Text c="dimmed" size="xs">
                {row.submittedAt ? fmt.dateTime(row.submittedAt) : "下書き"}
              </Text>
            </Group>
          </Group>
        </Row>
      ))}
    </Stack>
  );
}
