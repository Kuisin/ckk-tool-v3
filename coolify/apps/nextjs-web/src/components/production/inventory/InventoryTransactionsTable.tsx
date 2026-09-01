"use client";

/**
 * InventoryTransactionsTable — 在庫取引履歴テーブル（PD24/PD25 共通）。
 *
 * 列: 日時 / 種別（IN=緑 入庫・OUT=赤 出庫・RESERVE=橙・RELEASE=灰・
 * ADJUST=紫）/ 数量 / 参照（DOR-・指示書番号などを mono 表示）/ 備考。
 */

import { Badge, Table, Text } from "@mantine/core";
import { IconArrowsExchange } from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import { useFormat } from "@/components/layout/PreferencesProvider";
import { EmptyState } from "@/components/ui/EmptyState";
import { type InventoryTransactionRow, TRANSACTION_TYPE_BADGE } from "./model";

export function InventoryTransactionsTable({
  rows,
  unit,
}: {
  rows: InventoryTransactionRow[];
  /** 数量の単位表示（製品は「本」等）。 */
  unit: string;
}) {
  const tr = useTranslations();
  const fmt = useFormat();
  if (rows.length === 0) {
    return (
      <EmptyState
        icon={<IconArrowsExchange size={24} />}
        message={tr("production.inventory.thereIsNoTransactionHistory")}
      />
    );
  }

  return (
    <Table.ScrollContainer minWidth={640}>
      <Table>
        <Table.Thead>
          <Table.Tr>
            <Table.Th w={150}>{tr("common.dateAndTime")}</Table.Th>
            <Table.Th w={90}>{tr("common.type2")}</Table.Th>
            <Table.Th ta="right" w={110}>
              {tr("common.quantity")}
            </Table.Th>
            <Table.Th>{tr("common.reference")}</Table.Th>
            <Table.Th>{tr("common.notes")}</Table.Th>
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
                    {fmt.dateTime(t.createdAt)}
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
