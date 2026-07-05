"use client";

/**
 * PriceListDetail — 価格表 詳細 (design.md §8.2).
 *
 * One (顧客, 製品, 注文種別) entry: its 有効期間 + 状態, a read-only table of
 * quantity tiers, and the dedicated 値引きルール list (期間 × 数量 → 値引き —
 * 見積書作成時に自動適用される). 注文種別ごとにページを分ける。`id` is the
 * entry key; falls back to the first entry so the layout always renders.
 * Replace the mock lookup with a server fetch.
 */

import {
  ActionIcon,
  Anchor,
  Badge,
  Group,
  Stack,
  Table,
  Tabs,
  Text,
  Tooltip,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  IconCopy,
  IconCopyPlus,
  IconEdit,
  IconFileText,
  IconPlus,
  IconTrash,
} from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ActiveBadge } from "@/components/ui/ActiveBadge";
import { SecondaryButton } from "@/components/ui/buttons";
import { DocNumber } from "@/components/ui/DocNumber";
import { FieldValue } from "@/components/ui/FieldValue";
import { MoneyText } from "@/components/ui/MoneyText";
import { openConfirm } from "@/components/ui/modals";
import { StatusBadge } from "@/components/ui/StatusBadge";
import {
  type AuditEntry,
  AuditTimeline,
  DetailShell,
  ResourceActions,
  SummaryGrid,
} from "@/components/ui/shells";
import { formatDate, formatDateTime } from "@/lib/format";
import { ORDER_TYPE_LABEL } from "@/lib/mock";
import { MOCK_QUOTES } from "../quotes/mock";
import { CopyPriceListModal } from "./CopyPriceListModal";
import { CreateQuoteModal } from "./CreateQuoteModal";
import { DeletePriceListModal } from "./DeletePriceListModal";
import { DiscountRuleModal } from "./DiscountRuleModal";
import { DuplicatePriceListModal } from "./DuplicatePriceListModal";
import {
  discountValueLabel,
  entrySummary,
  getPriceEntry,
  MOCK_PRICE_ENTRIES,
  multiplierLabel,
  type PriceDiscount,
  priceRangeLabel,
  quantityRange,
  siblingOrderTypes,
  tierUnitPrice,
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
  const [quoteOpen, setQuoteOpen] = useState(false);

  // 値引きルール（専用リスト）— add/edit/delete はローカル state でデモ。
  // TODO(server-action): persist to price_list_discounts.
  const [discounts, setDiscounts] = useState<PriceDiscount[]>(entry.discounts);
  const [discountModalOpen, setDiscountModalOpen] = useState(false);
  const [discountEditTarget, setDiscountEditTarget] =
    useState<PriceDiscount | null>(null);

  const saveDiscount = (rule: PriceDiscount) => {
    setDiscounts((prev) =>
      prev.some((d) => d.id === rule.id)
        ? prev.map((d) => (d.id === rule.id ? rule : d))
        : [...prev, rule],
    );
    notifications.show({
      title: "保存しました",
      message: `値引きルール「${rule.label}」を保存しました`,
      color: "green",
    });
  };

  const removeDiscount = (rule: PriceDiscount) => {
    openConfirm({
      title: "値引きルールの削除",
      message: `「${rule.label}」を削除します。この操作は取り消せません。`,
      confirmLabel: "削除",
      onConfirm: () =>
        setDiscounts((prev) => prev.filter((d) => d.id !== rule.id)),
    });
  };

  // この価格表（の tier）から作成された見積書。
  const tierIds = new Set(entry.tiers.map((t) => t.id));
  const relatedQuotes = MOCK_QUOTES.map((q) => {
    const items = q.items.filter(
      (it) => it.priceTierId && tierIds.has(it.priceTierId),
    );
    return {
      quote: q,
      quantity: items.reduce((sum, it) => sum + it.quantity, 0),
      amount: items.reduce((sum, it) => sum + it.amount, 0),
      matched: items.length,
    };
  }).filter((x) => x.matched > 0);

  return (
    <DetailShell
      actions={
        <ResourceActions
          menuItems={[
            {
              label: "見積書を作成",
              icon: <IconFileText size={14} />,
              onClick: () => setQuoteOpen(true),
            },
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
        <FieldValue
          label="基準単価"
          value={<MoneyText ta="left" value={entry.baseUnitPrice} />}
        />
        <FieldValue label="段階数" value={`${summary.tierCount}段階`} />
        <FieldValue
          label="単価範囲"
          value={priceRangeLabel(summary.minPrice, summary.maxPrice)}
        />
        <FieldValue
          label="試算元"
          value={
            entry.estimateId ? (
              <Anchor
                onClick={() =>
                  router.push(`/sales/trial-estimates/${entry.estimateId}`)
                }
                size="sm"
              >
                <DocNumber c="blue">{entry.estimateNumber}</DocNumber>
              </Anchor>
            ) : (
              "手動登録"
            )
          }
        />
        <FieldValue label="作成者" value={entry.createdBy} />
      </SummaryGrid>

      <Tabs defaultValue="prices">
        <Tabs.List>
          <Tabs.Tab value="prices">価格設定</Tabs.Tab>
          <Tabs.Tab value="discounts">値引き設定</Tabs.Tab>
          <Tabs.Tab value="related">関連</Tabs.Tab>
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
            <SecondaryButton
              leftSection={<IconPlus size={16} />}
              onClick={() =>
                router.push(
                  `${BASE_PATH}/new?customer=${entry.customerId}&product=${entry.productId}`,
                )
              }
            >
              注文種別を追加
            </SecondaryButton>
          </Group>

          <Text c="dimmed" mb="xs" size="xs">
            単価 = 基準単価 <MoneyText value={entry.baseUnitPrice} /> ×
            倍率（行ごとに手動上書き可・編集は「編集」から）
          </Text>
          <Table.ScrollContainer minWidth={480}>
            <Table>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>数量範囲</Table.Th>
                  <Table.Th ta="right">倍率</Table.Th>
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
                      <Text className="tabular-nums" ff="mono" size="sm">
                        {multiplierLabel(tier)}
                      </Text>
                    </Table.Td>
                    <Table.Td ta="right">
                      <Group gap="xs" justify="flex-end" wrap="nowrap">
                        {tier.priceOverride != null && (
                          <Badge color="orange" size="xs" variant="light">
                            手動
                          </Badge>
                        )}
                        <MoneyText
                          currency={entry.currency}
                          value={tierUnitPrice(entry, tier)}
                        />
                      </Group>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        </Tabs.Panel>

        <Tabs.Panel pt="md" value="discounts">
          <Group justify="space-between" mb="sm">
            <Text c="dimmed" size="xs">
              期間・数量条件を満たすルールが見積書作成時に自動適用されます（複数該当時は値引き額が最大のもの）。
            </Text>
            <SecondaryButton
              leftSection={<IconPlus size={16} />}
              onClick={() => {
                setDiscountEditTarget(null);
                setDiscountModalOpen(true);
              }}
            >
              値引きルールを追加
            </SecondaryButton>
          </Group>

          {discounts.length > 0 ? (
            <Table.ScrollContainer minWidth={720}>
              <Table>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>名称</Table.Th>
                    <Table.Th ta="right">値引き</Table.Th>
                    <Table.Th>数量条件</Table.Th>
                    <Table.Th>有効期間</Table.Th>
                    <Table.Th>状態</Table.Th>
                    <Table.Th w={88} />
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {discounts.map((d) => (
                    <Table.Tr key={d.id}>
                      <Table.Td>
                        <Text fw={500} size="sm">
                          {d.label}
                        </Text>
                      </Table.Td>
                      <Table.Td ta="right">
                        <Text className="tabular-nums" ff="mono" size="sm">
                          {discountValueLabel(d)}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        {quantityRange(d.minQuantity, d.maxQuantity)}
                      </Table.Td>
                      <Table.Td>
                        <Text c="dimmed" className="tabular-nums" size="xs">
                          {validPeriod(d.validFrom, d.validUntil)}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <ActiveBadge active={d.isActive} />
                      </Table.Td>
                      <Table.Td>
                        <Group gap={4} justify="flex-end" wrap="nowrap">
                          <ActionIcon
                            aria-label="値引きルールを編集"
                            onClick={() => {
                              setDiscountEditTarget(d);
                              setDiscountModalOpen(true);
                            }}
                            variant="subtle"
                          >
                            <IconEdit size={16} />
                          </ActionIcon>
                          <ActionIcon
                            aria-label="値引きルールを削除"
                            color="red"
                            onClick={() => removeDiscount(d)}
                            variant="subtle"
                          >
                            <IconTrash size={16} />
                          </ActionIcon>
                        </Group>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
          ) : (
            <Text c="dimmed" size="sm">
              値引きルールがありません。「値引きルールを追加」から期間・数量条件つきの値引きを登録できます。
            </Text>
          )}
        </Tabs.Panel>

        <Tabs.Panel pt="md" value="related">
          <Stack gap="md">
            <div>
              <Text c="dimmed" mb={4} size="xs">
                試算元
              </Text>
              {entry.estimateId ? (
                <Anchor
                  onClick={() =>
                    router.push(`/sales/trial-estimates/${entry.estimateId}`)
                  }
                  size="sm"
                >
                  <DocNumber c="blue">{entry.estimateNumber}</DocNumber>
                </Anchor>
              ) : (
                <Text c="dimmed" size="sm">
                  手動登録
                </Text>
              )}
            </div>

            <div>
              <Text c="dimmed" mb={4} size="xs">
                この価格表から作成した見積書
              </Text>
              {relatedQuotes.length > 0 ? (
                <Table.ScrollContainer minWidth={520}>
                  <Table>
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th>見積番号</Table.Th>
                        <Table.Th ta="right">数量</Table.Th>
                        <Table.Th ta="right">金額</Table.Th>
                        <Table.Th>状態</Table.Th>
                        <Table.Th>作成日</Table.Th>
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {relatedQuotes.map(({ quote, quantity, amount }) => (
                        <Table.Tr
                          key={quote.id}
                          onClick={() =>
                            router.push(`/sales/quotes/${quote.id}`)
                          }
                          style={{ cursor: "pointer" }}
                        >
                          <Table.Td>
                            <DocNumber c="blue">{quote.quoteNumber}</DocNumber>
                          </Table.Td>
                          <Table.Td ta="right">{quantity} 本</Table.Td>
                          <Table.Td ta="right">
                            <MoneyText value={amount} />
                          </Table.Td>
                          <Table.Td>
                            <StatusBadge entity="Quote" status={quote.status} />
                          </Table.Td>
                          <Table.Td>
                            <Text c="dimmed" className="tabular-nums" size="xs">
                              {formatDate(quote.createdAt)}
                            </Text>
                          </Table.Td>
                        </Table.Tr>
                      ))}
                    </Table.Tbody>
                  </Table>
                </Table.ScrollContainer>
              ) : (
                <Text c="dimmed" size="sm">
                  —（「見積書を作成」でこの価格表から見積書を作成できます）
                </Text>
              )}
            </div>
          </Stack>
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
        source={entry}
      />
      <CopyPriceListModal
        onClose={() => setCopyOpen(false)}
        opened={copyOpen}
        source={entry}
      />
      <CreateQuoteModal
        onClose={() => setQuoteOpen(false)}
        opened={quoteOpen}
        source={entry}
      />
      <DiscountRuleModal
        initial={discountEditTarget}
        onClose={() => setDiscountModalOpen(false)}
        onSave={saveDiscount}
        opened={discountModalOpen}
      />
    </DetailShell>
  );
}
