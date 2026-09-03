"use client";

import { Badge, Stack, Text } from "@mantine/core";
import { useI18n } from "@/components/I18nProvider";
import type { ShippingRow } from "@/lib/display-board";
import { fillMessage, type KioskMessages } from "@/lib/i18n";
import { BoardFrame, BoardRowShell } from "../_shared/BoardFrame";

function statusOf(
  status: string,
  b: KioskMessages["display"]["board"]["shipping"],
): { label: string; color: string } {
  if (status === "CONFIRMED") return { label: b.confirmedLabel, color: "blue" };
  return { label: b.draftLabel, color: "gray" };
}

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
  const { m } = useI18n();
  const b = m.display.board.shipping;
  const total = rows.reduce((sum, r) => sum + r.totalQuantity, 0);

  return (
    <BoardFrame
      badge={
        rows.length > 0 ? (
          <Badge color="blue" size="xl" variant="light">
            {fillMessage(b.countUnit, { count: rows.length, total })}
          </Badge>
        ) : undefined
      }
      emptyMessage={b.empty}
      items={rows}
      renderRow={(row) => {
        const s = statusOf(row.status, b);
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
                {row.fromPlantName ?? b.noOrigin}
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
                {fillMessage(b.lineUnit, { count: row.itemCount })}
              </Text>
            </Stack>
          </BoardRowShell>
        );
      }}
      rowsPerPage={rowsPerPage}
      subtitle={plantName}
      title={b.title}
    />
  );
}
