"use client";

/**
 * ProductInventoryDetail — 製品在庫 詳細 (PD24, design.md §8.2)。
 *
 * SummaryGrid（製品 / 工場 / ロット / 区分 / 在庫数 / 予約数 / 利用可能 /
 * 保管場所 / 半製品の発生工程）+ Tabs: 予約（引当予約の一覧）/ 取引履歴。
 */

import { Anchor, Badge, Table, Tabs, Text } from "@mantine/core";
import { IconBookmark } from "@tabler/icons-react";
import Link from "next/link";
import { InventoryBadge } from "@/components/production/InventoryBadge";
import { DocNumber } from "@/components/ui/DocNumber";
import { EmptyState } from "@/components/ui/EmptyState";
import { FieldValue } from "@/components/ui/FieldValue";
import { DetailShell, SummaryGrid } from "@/components/ui/shells";
import { useTabParam } from "@/hooks/useUrlState";
import { formatDateTime } from "@/lib/format";
import { InventoryTransactionsTable } from "../InventoryTransactionsTable";
import {
  type InventoryReservationRow,
  RESERVATION_STATUS_BADGE,
} from "../model";
import type { ProductInventoryDetailData } from "./model";

const BASE_PATH = "/production/inventory/products";

export function ProductInventoryDetail({
  record,
}: {
  record: ProductInventoryDetailData;
}) {
  // アクティブタブを ?tab= に保持（URL 共有でタブまで再現）
  const [tab, setTab] = useTabParam("reservations");
  return (
    <DetailShell
      breadcrumbs={["生産", { label: "製品在庫", href: BASE_PATH }, "詳細"]}
      status={
        record.isSemiFinished ? (
          <Badge color="orange" variant="light">
            半製品
          </Badge>
        ) : (
          <Badge color="gray" variant="light">
            完成品
          </Badge>
        )
      }
      title={record.productName}
      updatedAt={formatDateTime(record.updatedAt)}
    >
      <SummaryGrid>
        <FieldValue
          label="製品"
          value={
            <>
              <Text fw={500} size="sm">
                {record.productName}
              </Text>
              {record.productCode && (
                <DocNumber>{record.productCode}</DocNumber>
              )}
            </>
          }
        />
        <FieldValue label="工場" value={record.factoryName ?? "—"} />
        <FieldValue
          label="ロット番号"
          value={
            record.lotNumber != null ? (
              <DocNumber>{record.lotNumber}</DocNumber>
            ) : (
              "—"
            )
          }
        />
        <FieldValue
          label="区分"
          value={
            record.isSemiFinished ? (
              <Badge color="orange" variant="light">
                半製品
              </Badge>
            ) : (
              <Badge color="gray" variant="light">
                完成品
              </Badge>
            )
          }
        />
        <FieldValue
          label="在庫数"
          value={
            <Text className="tabular-nums" size="sm" span>
              {record.quantity.toLocaleString("ja-JP")} 本
            </Text>
          }
        />
        <FieldValue
          label="予約数"
          value={
            <Text className="tabular-nums" size="sm" span>
              {record.reservedQuantity.toLocaleString("ja-JP")} 本
            </Text>
          }
        />
        <FieldValue
          label="利用可能"
          value={
            <InventoryBadge
              available={record.available}
              reserved={record.reservedQuantity}
              unit="本"
            />
          }
        />
        <FieldValue label="保管場所" value={record.location || "—"} />
        {record.sourceStepLabel && (
          <FieldValue label="発生工程" value={record.sourceStepLabel} />
        )}
      </SummaryGrid>

      <Tabs onChange={setTab} value={tab}>
        <Tabs.List>
          <Tabs.Tab value="reservations">
            予約（{record.reservations.length}）
          </Tabs.Tab>
          <Tabs.Tab value="transactions">
            取引履歴（{record.transactions.length}）
          </Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel pt="md" value="reservations">
          <ReservationsTable rows={record.reservations} />
        </Tabs.Panel>

        <Tabs.Panel pt="md" value="transactions">
          <InventoryTransactionsTable rows={record.transactions} unit="本" />
        </Tabs.Panel>
      </Tabs>
    </DetailShell>
  );
}

/** 引当予約テーブル — 数量 / 状態 / 関連文書 / 日時。 */
function ReservationsTable({ rows }: { rows: InventoryReservationRow[] }) {
  if (rows.length === 0) {
    return (
      <EmptyState
        icon={<IconBookmark size={24} />}
        message="この在庫への引当予約はありません"
      />
    );
  }

  return (
    <Table.ScrollContainer minWidth={640}>
      <Table>
        <Table.Thead>
          <Table.Tr>
            <Table.Th ta="right" w={100}>
              数量
            </Table.Th>
            <Table.Th w={90}>状態</Table.Th>
            <Table.Th>関連</Table.Th>
            <Table.Th w={150}>予約日時</Table.Th>
            <Table.Th w={150}>確定/解除日時</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {rows.map((r) => {
            const def = RESERVATION_STATUS_BADGE[r.status] ?? {
              label: r.status,
              color: "gray",
            };
            return (
              <Table.Tr key={r.id}>
                <Table.Td className="tabular-nums" ta="right">
                  {r.quantity.toLocaleString("ja-JP")} 本
                </Table.Td>
                <Table.Td>
                  <Badge color={def.color} variant="light">
                    {def.label}
                  </Badge>
                </Table.Td>
                <Table.Td>
                  {r.salesOrderNumber ? (
                    <Anchor
                      component={Link}
                      ff="mono"
                      href={`/production/sales-orders/${r.salesOrderNumber}`}
                      size="sm"
                    >
                      {r.salesOrderNumber}
                    </Anchor>
                  ) : r.workOrderNumber != null ? (
                    <Anchor
                      component={Link}
                      ff="mono"
                      href={`/production/work-orders/${r.workOrderNumber}`}
                      size="sm"
                    >
                      #{r.workOrderNumber}
                    </Anchor>
                  ) : (
                    <Text c="dimmed" size="sm">
                      —
                    </Text>
                  )}
                </Table.Td>
                <Table.Td>
                  <Text className="tabular-nums" size="sm">
                    {formatDateTime(r.reservedAt)}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <Text className="tabular-nums" size="sm">
                    {formatDateTime(r.confirmedAt ?? r.releasedAt)}
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
