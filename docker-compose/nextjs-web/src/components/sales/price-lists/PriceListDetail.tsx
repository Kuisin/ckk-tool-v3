"use client";

/**
 * PriceListDetail — 価格表 詳細 (design.md §8.2).
 *
 * One (顧客, 製品, 注文種別) entry: its 有効期間 + 状態 and a read-only table of
 * quantity tiers. 注文種別ごとにページを分ける。`id` is the entry key; falls back
 * to the first entry so the layout always renders. Replace the mock lookup with
 * a server fetch.
 */

import { Badge, Button, Group, Table, Tabs, Tooltip } from "@mantine/core";
import {
  IconCopy,
  IconCopyPlus,
  IconPlus,
  IconTrash,
} from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ActiveBadge } from "@/components/ui/ActiveBadge";
import { FieldValue } from "@/components/ui/FieldValue";
import { MoneyText } from "@/components/ui/MoneyText";
import {
  type AuditEntry,
  AuditTimeline,
  DetailShell,
  ResourceActions,
  SummaryGrid,
} from "@/components/ui/shells";
import { formatDateTime } from "@/lib/format";
import { ORDER_TYPE_LABEL } from "@/lib/mock";
import { CopyPriceListModal } from "./CopyPriceListModal";
import { DeletePriceListModal } from "./DeletePriceListModal";
import { DuplicatePriceListModal } from "./DuplicatePriceListModal";
import {
  entrySummary,
  getPriceEntry,
  MOCK_PRICE_ENTRIES,
  priceRangeLabel,
  quantityRange,
  siblingOrderTypes,
  validPeriod,
} from "./mock";

const BASE_PATH = "/sales/price-lists";

// TODO(server): fetch audit_logs for this (顧客, 製品, 注文種別) entry.
const MOCK_AUDIT: AuditEntry[] = [
  {
    id: 1,
    action: "UPDATE",
    user: "鈴木",
    at: "2026/01/05 14:30",
    detail: "100本〜 の単価: ¥5,200 → ¥5,000",
  },
  {
    id: 2,
    action: "CREATE",
    user: "鈴木",
    at: "2025/12/20 09:15",
    detail: "価格表を作成",
  },
];

export function PriceListDetail({ id }: { id: string }) {
  const router = useRouter();
  const entry = getPriceEntry(id) ?? MOCK_PRICE_ENTRIES[0];
  const summary = entrySummary(entry);
  const siblings = siblingOrderTypes(entry);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [duplicateOpen, setDuplicateOpen] = useState(false);
  const [copyOpen, setCopyOpen] = useState(false);

  return (
    <DetailShell
      actions={
        <ResourceActions
          menuItems={[
            {
              label: "有効期間を変えて複製",
              icon: <IconCopy size={14} />,
              onClick: () => setDuplicateOpen(true),
            },
            {
              label: "別の顧客・製品へコピー",
              icon: <IconCopyPlus size={14} />,
              onClick: () => setCopyOpen(true),
            },
            {
              label: "削除",
              icon: <IconTrash size={14} />,
              color: "red",
              divider: true,
              onClick: () => setDeleteOpen(true),
            },
          ]}
          onEdit={() => router.push(`${BASE_PATH}/${entry.entryId}/edit`)}
        />
      }
      breadcrumbs={["販売", { label: "価格表", href: BASE_PATH }, "詳細"]}
      createdAt={formatDateTime(entry.createdAt)}
      status={<ActiveBadge active={entry.isActive} />}
      title={`価格表 詳細 · ${ORDER_TYPE_LABEL[entry.orderType]}`}
      updatedAt={formatDateTime(entry.updatedAt)}
    >
      <SummaryGrid>
        <FieldValue label="顧客" value={entry.customerName} />
        <FieldValue label="製品" value={entry.productName} />
        <FieldValue
          label="注文種別"
          value={
            <Badge color="gray" variant="light">
              {ORDER_TYPE_LABEL[entry.orderType]}
            </Badge>
          }
        />
        <FieldValue
          label="有効期間"
          value={validPeriod(entry.validFrom, entry.validUntil)}
        />
        <FieldValue label="段階数" value={`${summary.tierCount}段階`} />
        <FieldValue
          label="単価範囲"
          value={priceRangeLabel(summary.minPrice, summary.maxPrice)}
        />
        <FieldValue label="作成者" value={entry.createdBy} />
      </SummaryGrid>

      <Tabs defaultValue="prices">
        <Tabs.List>
          <Tabs.Tab value="prices">価格設定</Tabs.Tab>
          <Tabs.Tab value="history">履歴</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel pt="md" value="prices">
          <Group justify="space-between" mb="sm">
            {siblings.length > 0 ? (
              <Tooltip
                label={`登録済: ${siblings
                  .map((t) => ORDER_TYPE_LABEL[t])
                  .join("・")}`}
              >
                <Badge color="gray" variant="light">
                  他の注文種別 {siblings.length}件
                </Badge>
              </Tooltip>
            ) : (
              <span />
            )}
            <Button
              leftSection={<IconPlus size={16} />}
              onClick={() =>
                router.push(
                  `${BASE_PATH}/new?customer=${entry.customerId}&product=${entry.productId}`,
                )
              }
              size="sm"
              variant="default"
            >
              注文種別を追加
            </Button>
          </Group>

          <Table.ScrollContainer minWidth={360}>
            <Table>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>数量範囲</Table.Th>
                  <Table.Th ta="right">単価</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {entry.tiers.map((tier) => (
                  <Table.Tr key={tier.id}>
                    <Table.Td>
                      {quantityRange(tier.minQuantity, tier.maxQuantity)}
                    </Table.Td>
                    <Table.Td ta="right">
                      <MoneyText
                        currency={entry.currency}
                        value={tier.unitPrice}
                      />
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        </Tabs.Panel>

        <Tabs.Panel pt="md" value="history">
          <AuditTimeline entries={MOCK_AUDIT} />
        </Tabs.Panel>
      </Tabs>

      <DeletePriceListModal
        onClose={() => setDeleteOpen(false)}
        onConfirm={() => router.push(BASE_PATH)}
        opened={deleteOpen}
        productName={entry.productName}
      />
      <DuplicatePriceListModal
        onClose={() => setDuplicateOpen(false)}
        opened={duplicateOpen}
        productName={entry.productName}
        unitPrice={summary.minPrice}
      />
      <CopyPriceListModal
        onClose={() => setCopyOpen(false)}
        opened={copyOpen}
        source={entry}
      />
    </DetailShell>
  );
}
