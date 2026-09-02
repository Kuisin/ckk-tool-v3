"use client";

import { Badge, Stack, Text } from "@mantine/core";
import { useI18n } from "@/components/I18nProvider";
import type { PendingRow } from "@/lib/display-board";
import { fillMessage } from "@/lib/i18n";
import { BoardFrame, BoardRowShell } from "../_shared/BoardFrame";

/**
 * 未処理・手配待ちの見た目。
 *
 * 一番伝えたいのは**残り数**（受注数 − 手配済）。納期は遅れているものだけ
 * 赤くする — 全部に色を付けると、どれが本当に急ぎか分からなくなる。
 */
export function PendingBoard({
  rows,
  plantName,
  rowsPerPage,
}: {
  rows: PendingRow[];
  plantName: string | null;
  rowsPerPage: number;
}) {
  const { m } = useI18n();
  const b = m.display.board.pending;
  const overdue = rows.filter((r) => r.overdue).length;

  return (
    <BoardFrame
      badge={
        overdue > 0 ? (
          <Badge color="red" size="xl" variant="filled">
            {fillMessage(b.overdueCount, { count: overdue })}
          </Badge>
        ) : undefined
      }
      emptyMessage={b.empty}
      items={rows}
      renderRow={(row) => (
        <BoardRowShell
          accent={
            row.overdue
              ? "var(--mantine-color-red-6)"
              : "var(--mantine-color-dark-4)"
          }
          key={row.id}
        >
          <Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
            <Text fw={600} style={{ fontSize: "1.5rem" }} truncate>
              {row.productName}
            </Text>
            <Text c="dimmed" size="md" truncate>
              {row.customerName}
            </Text>
          </Stack>

          <Stack align="flex-end" gap={2} style={{ minWidth: "10rem" }}>
            <Text
              c={row.overdue ? "red.4" : undefined}
              fw={600}
              style={{ fontSize: "1.4rem" }}
            >
              {row.deliveryDate
                ? `${row.deliveryDate.getMonth() + 1}/${row.deliveryDate.getDate()}`
                : b.noDueDate}
            </Text>
            <Text c="dimmed" size="sm">
              {row.overdue ? b.overdueLabel : b.dueLabel}
            </Text>
          </Stack>

          <Stack align="flex-end" gap={2} style={{ minWidth: "9rem" }}>
            <Text fw={700} style={{ fontSize: "1.8rem" }}>
              {row.quantity - row.arrangedQuantity}
            </Text>
            <Text c="dimmed" size="sm">
              {fillMessage(b.unarranged, { quantity: row.quantity })}
            </Text>
          </Stack>
        </BoardRowShell>
      )}
      rowsPerPage={rowsPerPage}
      subtitle={plantName}
      title={b.title}
    />
  );
}
