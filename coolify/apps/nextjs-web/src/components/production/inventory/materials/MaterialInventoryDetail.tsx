"use client";

/**
 * MaterialInventoryDetail — 素材在庫 詳細 (PD25, design.md §8.2)。
 *
 * SummaryGrid（素材 / 拠点 / 在庫数 / 予約数 / 利用可能 / 次回入荷 /
 * 保管場所）+ ATP タイムライン（現時点 → 入荷予定日ごとの累積 available、
 * 「未定」= 9999-12-31 マーカー、負数は赤表示）+ 取引履歴。
 */

import { Table, Tabs, Text } from "@mantine/core";
import { useTranslations } from "next-intl";
import { useFormat } from "@/components/layout/PreferencesProvider";
import { InventoryBadge } from "@/components/production/InventoryBadge";
import { AppTabs } from "@/components/ui/AppTabs";
import { DocNumber } from "@/components/ui/DocNumber";
import { FieldValue } from "@/components/ui/FieldValue";
import { DetailShell, SummaryGrid } from "@/components/ui/shells";
import { useTabParam } from "@/hooks/useUrlState";
import { InventoryTransactionsTable } from "../InventoryTransactionsTable";
import type { MaterialInventoryDetailData } from "./model";

const BASE_PATH = "/production/inventory?tab=materials";

/** 入荷日未定マーカー（lib/atp-core buildAtpTimeline と一致）。 */
const UNDATED_MARKER = "9999-12-31";

export function MaterialInventoryDetail({
  record,
}: {
  record: MaterialInventoryDetailData;
}) {
  const tr = useTranslations();
  const fmt = useFormat();
  // アクティブタブを ?tab= に保持（URL 共有でタブまで再現）
  const [tab, setTab] = useTabParam("atp");
  return (
    <DetailShell
      breadcrumbs={[
        tr("common.production"),
        { label: tr("common.inventory"), href: BASE_PATH },
        "詳細",
      ]}
      title={record.materialCode}
      updatedAt={fmt.dateTime(record.updatedAt)}
    >
      <SummaryGrid>
        <FieldValue
          label={tr("common.materials")}
          value={
            <>
              <DocNumber>{record.materialCode}</DocNumber>
              <Text c="dimmed" size="xs">
                {record.materialName}
              </Text>
            </>
          }
        />
        <FieldValue label="拠点" value={record.plantName ?? "—"} />
        <FieldValue
          label={tr("common.onHand")}
          value={
            <Text className="tabular-nums" size="sm" span>
              {record.quantity.toLocaleString("ja-JP")} {record.unit}
            </Text>
          }
        />
        <FieldValue
          label={tr("common.reserved")}
          value={
            <Text className="tabular-nums" size="sm" span>
              {record.reservedQuantity.toLocaleString("ja-JP")} {record.unit}
            </Text>
          }
        />
        <FieldValue
          label={tr("common.available")}
          value={
            <InventoryBadge
              available={record.available}
              reserved={record.reservedQuantity}
              unit={record.unit}
            />
          }
        />
        <FieldValue
          label={tr("common.nextReceipt")}
          value={
            record.atp.nextReceiptDate
              ? fmt.date(record.atp.nextReceiptDate)
              : "—"
          }
        />
        <FieldValue
          label={tr("common.storageLocations")}
          value={
            record.storageLabel ?? record.location ?? tr("common.unassigned")
          }
        />
        <FieldValue label={tr("common.notes")} value={record.notes || "—"} />
      </SummaryGrid>

      <AppTabs onChange={setTab} value={tab}>
        <Tabs.List>
          <Tabs.Tab value="atp">
            {tr("production.inventory.aTPTimeline")}
          </Tabs.Tab>
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
      </AppTabs>
    </DetailShell>
  );
}

/** ATP タイムライン — 時点 / 入荷量 / 累積利用可能 / 参照発注番号。 */
function AtpTimelineTable({ record }: { record: MaterialInventoryDetailData }) {
  const tr = useTranslations();
  const fmt = useFormat();
  return (
    <Table.ScrollContainer minWidth={560}>
      <Table>
        <Table.Thead>
          <Table.Tr>
            <Table.Th w={130}>{tr("production.inventory.asOf")}</Table.Th>
            <Table.Th ta="right" w={120}>
              {tr("production.inventory.receivedQuantity")}
            </Table.Th>
            <Table.Th ta="right" w={130}>
              {tr("common.available")}
            </Table.Th>
            <Table.Th>{tr("common.reference")}</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {record.atp.timeline.map((p) => {
            const label =
              p.date == null
                ? tr("production.inventory.rightNow")
                : p.date === UNDATED_MARKER
                  ? tr("production.inventory.undecided")
                  : fmt.date(p.date);
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
