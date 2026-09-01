"use client";

import { Badge, Table, Text } from "@mantine/core";
import { useTr } from "@/hooks/useTr";
import type { PortalOrderLineRow } from "@/lib/portal-progress";
import {
  PORTAL_PROGRESS_LABEL,
  type PortalProgress,
} from "@/lib/portal-progress-core";

const COLOR: Record<PortalProgress, string> = {
  RECEIVED: "gray",
  IN_PRODUCTION: "violet",
  READY: "blue",
  SHIPPED: "orange",
  DELIVERED: "green",
  CANCELLED: "red",
};

export function PortalOrderTable({ rows }: { rows: PortalOrderLineRow[] }) {
  const tr = useTr();
  return (
    <Table highlightOnHover striped withTableBorder>
      <Table.Thead>
        <Table.Tr>
          <Table.Th>{tr("注文番号")}</Table.Th>
          <Table.Th>製品</Table.Th>
          <Table.Th ta="right">{tr("数量")}</Table.Th>
          <Table.Th>{tr("納期")}</Table.Th>
          <Table.Th>{tr("状況")}</Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {rows.map((r) => (
          <Table.Tr key={`${r.acceptanceNumber}-${r.branch}`}>
            <Table.Td>
              <Text ff="monospace" size="sm">
                {r.acceptanceNumber}
                {r.branch != null
                  ? `-${String(r.branch).padStart(2, "0")}`
                  : ""}
              </Text>
            </Table.Td>
            <Table.Td>
              <Text size="sm">{r.productName}</Text>
            </Table.Td>
            <Table.Td ta="right">
              <Text size="sm">{r.quantity.toLocaleString("ja-JP")}</Text>
            </Table.Td>
            <Table.Td>
              <Text size="sm">{r.deliveryDate ?? "—"}</Text>
            </Table.Td>
            <Table.Td>
              <Badge color={COLOR[r.progress]} size="sm" variant="light">
                {PORTAL_PROGRESS_LABEL[r.progress]}
              </Badge>
            </Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  );
}
