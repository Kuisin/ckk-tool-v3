"use client";

import { Badge, Stack, Text } from "@mantine/core";
import type { ShippingRow } from "@/lib/display-board";
import { BoardFrame, BoardRowShell } from "../_shared/BoardFrame";

const STATUS: Record<string, { label: string; color: string }> = {
  DRAFT: { label: "準備中", color: "gray" },
  CONFIRMED: { label: "確定", color: "blue" },
};

/** 出荷予定の見た目。出荷場から見て「あと何件・何本」が分かればよい。 */
export function ShippingBoard({
  rows,
  plantName,
  rowsPerPage,
}: {
  rows: ShippingRow[];
  plantName: string | null;
  rowsPerPage: number;
}) {
  const total = rows.reduce((sum, r) => sum + r.totalQuantity, 0);

  return (
    <BoardFrame
      badge={
        rows.length > 0 ? (
          <Badge color="blue" size="xl" variant="light">
            {rows.length} 件 / {total} 本
          </Badge>
        ) : undefined
      }
      emptyMessage="出荷予定はありません"
      items={rows}
      renderRow={(row) => {
        const s = STATUS[row.status] ?? STATUS.DRAFT;
        return (
          <BoardRowShell
            accent={
              row.status === "CONFIRMED"
                ? "var(--mantine-color-blue-5)"
                : "var(--mantine-color-dark-4)"
            }
            key={row.id}
          >
            <Text
              ff="monospace"
              fw={700}
              style={{ fontSize: "1.5rem", minWidth: "10ch" }}
            >
              {row.documentNumber.replace(/^DOR-\d{6}-/, "")}
            </Text>

            <Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
              <Text fw={600} style={{ fontSize: "1.5rem" }} truncate>
                {row.customerName}
              </Text>
              <Text c="dimmed" size="md" truncate>
                {row.fromPlantName ?? "出荷元未設定"}
              </Text>
            </Stack>

            <Badge color={s.color} size="lg" variant="light" w={90}>
              {s.label}
            </Badge>

            <Stack align="flex-end" gap={2} style={{ minWidth: "8rem" }}>
              <Text fw={700} style={{ fontSize: "1.8rem" }}>
                {row.totalQuantity}
              </Text>
              <Text c="dimmed" size="sm">
                {row.itemCount} 明細 / 本
              </Text>
            </Stack>
          </BoardRowShell>
        );
      }}
      rowsPerPage={rowsPerPage}
      subtitle={plantName}
      title="出荷予定"
    />
  );
}
