"use client";

/**
 * InventoryTransactionsTable — 在庫取引履歴テーブル（PD24/PD25 共通）。
 *
 * 列: 日時 / 種別（IN=緑 入庫・OUT=赤 出庫・RESERVE=橙・RELEASE=灰・
 * ADJUST=紫）/ 数量 / 参照（SHP-・指示書番号などを mono 表示）/ 備考。
 */

import { Badge, Table, Text } from "@mantine/core";
import { IconArrowsExchange } from "@tabler/icons-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatDateTime } from "@/lib/format";
import { type InventoryTransactionRow, TRANSACTION_TYPE_BADGE } from "./model";

export function InventoryTransactionsTable({
  rows,
  unit,
}: {
  rows: InventoryTransactionRow[];
  /** 数量の単位表示（製品は「本」等）。 */
  unit: string;
}) {
  if (rows.length === 0) {
    return (
      <EmptyState
        icon={<IconArrowsExchange size={24} />}
        message="取引履歴がありません"
      />
    );
  }

  return (
    <Table.ScrollContainer minWidth={640}>
      <Table>
        <Table.Thead>
          <Table.Tr>
            <Table.Th w={150}>日時</Table.Th>
            <Table.Th w={90}>種別</Table.Th>
            <Table.Th ta="right" w={110}>
              数量
            </Table.Th>
            <Table.Th>参照</Table.Th>
            <Table.Th>備考</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {rows.map((t) => {
            const def = TRANSACTION_TYPE_BADGE[t.transactionType] ?? {
              label: t.transactionType,
              color: "gray",
            };
            return (
              <Table.Tr key={t.id}>
                <Table.Td>
                  <Text className="tabular-nums" size="sm">
                    {formatDateTime(t.createdAt)}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <Badge color={def.color} variant="light">
                    {def.label}
                  </Badge>
                </Table.Td>
                <Table.Td className="tabular-nums" ta="right">
                  {t.quantity.toLocaleString("ja-JP")} {unit}
                </Table.Td>
                <Table.Td>
                  {t.referenceLabel ? (
                    <Text ff="mono" size="sm">
                      {t.referenceLabel}
                    </Text>
                  ) : (
                    <Text c="dimmed" size="sm">
                      —
                    </Text>
                  )}
                </Table.Td>
                <Table.Td>
                  <Text c="dimmed" size="xs">
                    {t.notes || "—"}
                  </Text>
                </Table.Td>
              </Table.Tr>
            );
          })}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  );
}
