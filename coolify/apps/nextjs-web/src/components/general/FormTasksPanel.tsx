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
import type { CompletedRequestRow } from "@/app/(dashboard)/general/tasks/completions-data";
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
  unread = false,
}: {
  onClick: () => void;
  children: React.ReactNode;
  /** 未読の印（design.md §1.1 — 左 3px の blue.5）。 */
  unread?: boolean;
}) {
  return (
    <Paper
      onClick={onClick}
      p="sm"
      radius="sm"
      style={{
        cursor: "pointer",
        ...(unread
          ? { borderLeft: "3px solid var(--mantine-color-blue-5)" }
          : {}),
      }}
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

/**
 * CompletedRequestsList — 自分宛に届いた「完了した申請・報告」。
 *
 * 誰に届くかはフォームの共有設定（完了通知を付けた共有行）が決める。未読は
 * 左の青い線で示し、その回答を開いた時点で既読になる（押す操作は無い）。
 */
export function CompletedRequestsList({
  rows,
}: {
  rows: CompletedRequestRow[];
}) {
  const router = useRouter();
  const fmt = useFormat();
  const isMobile = useIsMobile();

  if (rows.length === 0) {
    return (
      <Paper p="md" radius="md" withBorder>
        <EmptyState
          icon={<IconForms size={28} />}
          message="完了の通知はありません"
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
          unread={!row.readAt}
        >
          <Group justify="space-between" wrap={isMobile ? "wrap" : "nowrap"}>
            <Group gap="sm" style={{ minWidth: 0 }} wrap="nowrap">
              <Text fw={row.readAt ? 500 : 700} size="sm" truncate>
                {row.formTitle}
              </Text>
              <Text c="dimmed" className="tabular-nums" size="xs">
                No. {row.recordNo}
              </Text>
              <StatusBadge entity="FormResponse" status={row.status} />
              {row.respondent && (
                <Text c="dimmed" size="xs" truncate>
                  {row.respondent}
                </Text>
              )}
            </Group>
            <Group gap="xs" style={{ flexShrink: 0 }}>
              {!row.readAt && (
                <Badge color="blue" size="sm" variant="light">
                  未読
                </Badge>
              )}
              <Text c="dimmed" size="xs">
                {fmt.dateTime(row.notifiedAt)}
              </Text>
            </Group>
          </Group>
        </Row>
      ))}
    </Stack>
  );
}
