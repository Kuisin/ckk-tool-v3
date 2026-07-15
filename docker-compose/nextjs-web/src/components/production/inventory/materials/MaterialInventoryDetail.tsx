"use client";

/**
 * MaterialInventoryDetail — 素材在庫 詳細 (PD25, design.md §8.2)。
 *
 * SummaryGrid（素材 / 工場 / 在庫数 / 予約数 / 利用可能 / 次回入荷 /
 * 保管場所）+ ATP タイムライン（現時点 → 入荷予定日ごとの累積 available、
 * 「未定」= 9999-12-31 マーカー、負数は赤表示）+ 取引履歴。
 */

import { Table, Tabs, Text } from "@mantine/core";
import { InventoryBadge } from "@/components/production/InventoryBadge";
import { DocNumber } from "@/components/ui/DocNumber";
import { FieldValue } from "@/components/ui/FieldValue";
import { DetailShell, SummaryGrid } from "@/components/ui/shells";
import { useTabParam } from "@/hooks/useUrlState";
import { formatDate, formatDateTime } from "@/lib/format";
import { InventoryTransactionsTable } from "../InventoryTransactionsTable";
import type { MaterialInventoryDetailData } from "./model";

const BASE_PATH = "/production/inventory/materials";

/** 入荷日未定マーカー（lib/atp-core buildAtpTimeline と一致）。 */
const UNDATED_MARKER = "9999-12-31";

export function MaterialInventoryDetail({
  record,
}: {
  record: MaterialInventoryDetailData;
}) {
  // アクティブタブを ?tab= に保持（URL 共有でタブまで再現）
  const [tab, setTab] = useTabParam("atp");
  return (
    <DetailShell
      breadcrumbs={["生産", { label: "素材在庫", href: BASE_PATH }, "詳細"]}
      title={record.materialCode}
      updatedAt={formatDateTime(record.updatedAt)}
    >
      <SummaryGrid>
        <FieldValue
          label="素材"
          value={
            <>
              <DocNumber>{record.materialCode}</DocNumber>
              <Text c="dimmed" size="xs">
                {record.materialName}
              </Text>
            </>
          }
        />
        <FieldValue label="工場" value={record.factoryName ?? "—"} />
        <FieldValue
          label="在庫数"
          value={
            <Text className="tabular-nums" size="sm" span>
              {record.quantity.toLocaleString("ja-JP")} {record.unit}
            </Text>
          }
        />
        <FieldValue
          label="予約数"
          value={
            <Text className="tabular-nums" size="sm" span>
              {record.reservedQuantity.toLocaleString("ja-JP")} {record.unit}
            </Text>
          }
        />
        <FieldValue
          label="利用可能"
          value={
            <InventoryBadge
              available={record.available}
              reserved={record.reservedQuantity}
              unit={record.unit}
            />
          }
        />
        <FieldValue
          label="次回入荷"
          value={
            record.atp.nextReceiptDate
              ? formatDate(record.atp.nextReceiptDate)
              : "—"
          }
        />
        <FieldValue label="保管場所" value={record.location || "—"} />
        <FieldValue label="備考" value={record.notes || "—"} />
      </SummaryGrid>

      <Tabs onChange={setTab} value={tab}>
        <Tabs.List>
          <Tabs.Tab value="atp">ATP タイムライン</Tabs.Tab>
          <Tabs.Tab value="transactions">
            取引履歴（{record.transactions.length}）
          </Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel pt="md" value="atp">
          <AtpTimelineTable record={record} />
        </Tabs.Panel>

        <Tabs.Panel pt="md" value="transactions">
          <InventoryTransactionsTable
            rows={record.transactions}
            unit={record.unit}
          />
        </Tabs.Panel>
      </Tabs>
    </DetailShell>
  );
}

/** ATP タイムライン — 時点 / 入荷量 / 累積利用可能 / 参照発注番号。 */
function AtpTimelineTable({ record }: { record: MaterialInventoryDetailData }) {
  return (
    <Table.ScrollContainer minWidth={560}>
      <Table>
        <Table.Thead>
          <Table.Tr>
            <Table.Th w={130}>時点</Table.Th>
            <Table.Th ta="right" w={120}>
              入荷量
            </Table.Th>
            <Table.Th ta="right" w={130}>
              利用可能
            </Table.Th>
            <Table.Th>参照</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {record.atp.timeline.map((p) => {
            const label =
              p.date == null
                ? "現時点"
                : p.date === UNDATED_MARKER
                  ? "未定"
                  : formatDate(p.date);
            return (
              <Table.Tr key={p.date ?? "now"}>
                <Table.Td>
                  <Text
                    c={p.date == null ? undefined : "dimmed"}
                    className="tabular-nums"
                    fw={p.date == null ? 600 : undefined}
                    size="sm"
                  >
                    {label}
                  </Text>
                </Table.Td>
                <Table.Td className="tabular-nums" ta="right">
                  {p.delta > 0
                    ? `+${p.delta.toLocaleString("ja-JP")} ${record.unit}`
                    : "—"}
                </Table.Td>
                <Table.Td ta="right">
                  <Text
                    c={p.available < 0 ? "red" : undefined}
                    className="tabular-nums"
                    fw={600}
                    size="sm"
                  >
                    {p.available.toLocaleString("ja-JP")} {record.unit}
                  </Text>
                </Table.Td>
                <Table.Td>
                  {p.refs.length > 0 ? (
                    <Text ff="mono" size="sm">
                      {p.refs.join(", ")}
                    </Text>
                  ) : (
                    <Text c="dimmed" size="sm">
                      —
                    </Text>
                  )}
                </Table.Td>
              </Table.Tr>
            );
          })}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  );
}
