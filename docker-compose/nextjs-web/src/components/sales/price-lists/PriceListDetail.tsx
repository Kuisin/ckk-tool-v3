"use client";

/**
 * PriceListDetail — 価格表 詳細 (design.md §8.2).
 *
 * One (顧客, 製品, 注文種別) entry: its 有効期間 + 状態, a read-only table of
 * quantity tiers, and the dedicated 値引きルール list (期間 × 数量 → 値引き —
 * 見積書作成時に自動適用される). 注文種別ごとにページを分ける。Backed by
 * sales.price_list_entries via the server page; 値引きルールの追加・編集・削除
 * は Server Actions で永続化する。
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
import { useState, useTransition } from "react";
import {
  deleteDiscountRule,
  saveDiscountRule,
} from "@/app/(dashboard)/sales/price-lists/actions";
import type { RelatedQuoteRow } from "@/app/(dashboard)/sales/price-lists/data";
import { ActiveBadge } from "@/components/ui/ActiveBadge";
import { SecondaryButton } from "@/components/ui/buttons";
import { DocNumber } from "@/components/ui/DocNumber";
import { FieldValue } from "@/components/ui/FieldValue";
import { HistoryPanel } from "@/components/ui/HistoryPanel";
import { MoneyText } from "@/components/ui/MoneyText";
import { openConfirm } from "@/components/ui/modals";
import { StatusBadge } from "@/components/ui/StatusBadge";
import {
  type AuditEntry,
  DetailShell,
  ResourceActions,
  SummaryGrid,
} from "@/components/ui/shells";
import { formatDate, formatDateTime } from "@/lib/format";
import type { Option } from "@/lib/mock";
import { ORDER_TYPE_LABEL } from "@/lib/mock";
import { CopyPriceListModal } from "./CopyPriceListModal";
import { CreateQuoteModal } from "./CreateQuoteModal";
import { DeletePriceListModal } from "./DeletePriceListModal";
import { DiscountRuleModal } from "./DiscountRuleModal";
import { DuplicatePriceListModal } from "./DuplicatePriceListModal";
import {
  discountValueLabel,
  entrySummary,
  multiplierLabel,
  type PriceDiscount,
  type PriceListEntry,
  priceRangeLabel,
  quantityRange,
  tierUnitPrice,
  validPeriod,
} from "./model";

const BASE_PATH = "/sales/price-lists";

export function PriceListDetail({
  entry,
  siblings,
  relatedQuotes,
  customerOptions,
  productOptions,
  auditEntries,
}: {
  entry: PriceListEntry;
  /** 同一 (顧客, 製品) の他の注文種別。 */
  siblings: string[];
  relatedQuotes: RelatedQuoteRow[];
  customerOptions: Option[];
  productOptions: Option[];
  /** 操作履歴（audit_logs 由来、履歴タブ）。 */
  auditEntries: AuditEntry[];
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const summary = entrySummary(entry);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [duplicateOpen, setDuplicateOpen] = useState(false);
  const [copyOpen, setCopyOpen] = useState(false);
  const [quoteOpen, setQuoteOpen] = useState(false);

  // 値引きルール（専用リスト）— Server Action で永続化。
  const discounts = entry.discounts;
  const [discountModalOpen, setDiscountModalOpen] = useState(false);
  const [discountEditTarget, setDiscountEditTarget] =
    useState<PriceDiscount | null>(null);

  const saveDiscount = (rule: PriceDiscount) => {
    startTransition(async () => {
      const result = await saveDiscountRule({
        entryNumber: entry.entryId,
        id: rule.id || null,
        label: rule.label,
        discountType: rule.discountType,
        value: rule.value,
        minQuantity: rule.minQuantity,
        maxQuantity: rule.maxQuantity,
        validFrom: rule.validFrom,
        validUntil: rule.validUntil,
        isActive: rule.isActive,
      });
      if (result.ok) {
        notifications.show({
          title: "保存しました",
          message: `値引きルール「${rule.label}」を保存しました`,
          color: "green",
        });
        router.refresh();
      } else {
        notifications.show({
          title: "エラー",
          message: result.error,
          color: "red",
        });
      }
    });
  };

  const removeDiscount = (rule: PriceDiscount) => {
    openConfirm({
      title: "値引きルールの削除",
      message: `「${rule.label}」を削除します。この操作は取り消せません。`,
      confirmLabel: "削除",
      onConfirm: () => {
        startTransition(async () => {
          const result = await deleteDiscountRule(entry.entryId, rule.id);
          if (result.ok) {
            router.refresh();
          } else {
            notifications.show({
              title: "エラー",
              message: result.error,
              color: "red",
            });
          }
        });
      },
    });
  };

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
              label: "有効期間を変更",
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
                      {relatedQuotes.map((q) => (
                        <Table.Tr
                          key={q.quoteNumber}
                          onClick={() =>
                            router.push(`/sales/quotes/${q.quoteNumber}`)
                          }
                          style={{ cursor: "pointer" }}
                        >
                          <Table.Td>
                            <DocNumber c="blue">{q.quoteNumber}</DocNumber>
                          </Table.Td>
                          <Table.Td ta="right">{q.quantity} 本</Table.Td>
                          <Table.Td ta="right">
                            <MoneyText value={q.amount} />
                          </Table.Td>
                          <Table.Td>
                            <StatusBadge entity="Quote" status={q.status} />
                          </Table.Td>
                          <Table.Td>
                            <Text c="dimmed" className="tabular-nums" size="xs">
                              {formatDate(q.createdAt)}
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
          <HistoryPanel entries={auditEntries} />
        </Tabs.Panel>
      </Tabs>

      <DeletePriceListModal
        onClose={() => setDeleteOpen(false)}
        onDone={() => router.push(BASE_PATH)}
        opened={deleteOpen}
        target={entry}
      />
      <DuplicatePriceListModal
        onClose={() => setDuplicateOpen(false)}
        onDone={() => router.refresh()}
        opened={duplicateOpen}
        source={entry}
      />
      <CopyPriceListModal
        customerOptions={customerOptions}
        onClose={() => setCopyOpen(false)}
        opened={copyOpen}
        productOptions={productOptions}
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
