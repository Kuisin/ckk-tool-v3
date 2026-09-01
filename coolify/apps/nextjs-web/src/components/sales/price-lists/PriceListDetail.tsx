"use client";

/**
 * PriceListDetail — 価格表 詳細 (design.md §8.2).
 *
 * One (顧客, 製品) entry with its 注文種別バリアント一式。バリアントごとに
 * 有効期間 + 状態 + 基準単価 + 価格試算元、a read-only table of quantity tiers,
 * and the dedicated 値引きルール list (期間 × 数量 → 値引き — 見積書作成時に
 * 自動適用される). Backed by sales.price_list_entries via the server page;
 * 値引きルールの追加・編集・削除は Server Actions で永続化する。
 */

import {
  ActionIcon,
  Anchor,
  Badge,
  Divider,
  Group,
  Stack,
  Table,
  Tabs,
  Text,
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
import { useFormat } from "@/components/layout/PreferencesProvider";
import { ActiveBadge } from "@/components/ui/ActiveBadge";
import { AppTabs } from "@/components/ui/AppTabs";
import { SecondaryButton } from "@/components/ui/buttons";
import { DocNumber } from "@/components/ui/DocNumber";
import { FieldValue } from "@/components/ui/FieldValue";
import { HistoryPanel } from "@/components/ui/HistoryPanel";
import { MemoPanel } from "@/components/ui/MemoPanel";
import { MoneyText } from "@/components/ui/MoneyText";
import { openConfirm } from "@/components/ui/modals";
import { StatusBadge } from "@/components/ui/StatusBadge";
import {
  type AuditEntry,
  DetailShell,
  ResourceActions,
  SummaryGrid,
} from "@/components/ui/shells";
import { useTr } from "@/hooks/useTr";
import { useTabParam } from "@/hooks/useUrlState";
import type { MemoView } from "@/lib/document-memos";
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
  type PriceVariant,
  priceRangeLabel,
  quantityRange,
  tierUnitPrice,
  validPeriod,
} from "./model";

const BASE_PATH = "/sales/price-lists";

export function PriceListDetail({
  entry,
  relatedQuotes,
  customerOptions,
  productOptions,
  auditEntries,
  memos,
}: {
  entry: PriceListEntry;
  relatedQuotes: RelatedQuoteRow[];
  customerOptions: Option[];
  productOptions: Option[];
  /** 操作履歴（audit_logs 由来、履歴タブ）。 */
  auditEntries: AuditEntry[];
  /** 社内コメント（document_memos 由来、コメントタブ）。 */
  memos: MemoView[];
}) {
  const tr = useTr();
  const fmt = useFormat();
  const router = useRouter();
  const [, startTransition] = useTransition();
  // アクティブタブを ?tab= に保持（URL 共有でタブまで再現）
  const [tab, setTab] = useTabParam("prices");
  const summary = entrySummary(entry);
  const estimateVariants = entry.variants.filter((v) => v.estimateId);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [duplicateOpen, setDuplicateOpen] = useState(false);
  const [copyOpen, setCopyOpen] = useState(false);
  const [quoteOpen, setQuoteOpen] = useState(false);

  // 値引きルール（バリアントごとの専用リスト）— Server Action で永続化。
  const [discountModalOpen, setDiscountModalOpen] = useState(false);
  const [discountVariantId, setDiscountVariantId] = useState<string | null>(
    null,
  );
  const [discountEditTarget, setDiscountEditTarget] =
    useState<PriceDiscount | null>(null);

  const saveDiscount = (rule: PriceDiscount) => {
    if (!discountVariantId) return;
    startTransition(async () => {
      const result = await saveDiscountRule({
        entryNumber: entry.entryId,
        variantId: discountVariantId,
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
          title: tr("保存しました"),
          message: `値引きルール「${rule.label}」を保存しました`,
          color: "green",
        });
        router.refresh();
      } else {
        notifications.show({
          title: tr("エラー"),
          message: tr(result.error),
          color: "red",
        });
      }
    });
  };

  const removeDiscount = (rule: PriceDiscount) => {
    openConfirm({
      title: tr("値引きルールの削除"),
      message: `「${rule.label}」を削除します。この操作は取り消せません。`,
      confirmLabel: "削除",
      onConfirm: () => {
        startTransition(async () => {
          const result = await deleteDiscountRule(entry.entryId, rule.id);
          if (result.ok) {
            router.refresh();
          } else {
            notifications.show({
              title: tr("エラー"),
              message: tr(result.error),
              color: "red",
            });
          }
        });
      },
    });
  };

  const variantHeading = (variant: PriceVariant) => (
    <Group gap="xs" wrap="wrap">
      <Badge color="gray" variant="light">
        {ORDER_TYPE_LABEL[variant.orderType] ?? variant.orderType}
      </Badge>
      <ActiveBadge active={variant.isActive} />
      <Text c="dimmed" className="tabular-nums" size="xs">
        {validPeriod(fmt, variant.validFrom, variant.validUntil)}
      </Text>
    </Group>
  );

  return (
    <DetailShell
      actions={
        <ResourceActions
          menuItems={[
            {
              label: tr("見積書を作成"),
              icon: <IconFileText size={14} />,
              onClick: () => setQuoteOpen(true),
            },
            {
              label: tr("有効期間を変更"),
              icon: <IconCopy size={14} />,
              onClick: () => setDuplicateOpen(true),
            },
            {
              label: tr("別の顧客・製品へコピー"),
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
      breadcrumbs={[
        tr("販売"),
        { label: tr("価格表"), href: BASE_PATH },
        "詳細",
      ]}
      createdAt={fmt.dateTime(entry.createdAt)}
      status={<ActiveBadge active={entry.isActive} />}
      title={tr("価格表 詳細")}
      updatedAt={fmt.dateTime(entry.updatedAt)}
    >
      <SummaryGrid>
        <FieldValue label={tr("顧客")} value={entry.customerName} />
        <FieldValue label="製品" value={entry.productName} />
        <FieldValue
          label={tr("注文種別")}
          value={
            <Group gap={4} wrap="wrap">
              {entry.variants.map((v) => (
                <Badge color="gray" key={v.id} variant="light">
                  {ORDER_TYPE_LABEL[v.orderType] ?? v.orderType}
                </Badge>
              ))}
            </Group>
          }
        />
        <FieldValue label={tr("段階数")} value={`${summary.tierCount}段階`} />
        <FieldValue
          label={tr("単価範囲")}
          value={priceRangeLabel(summary.minPrice, summary.maxPrice)}
        />
        <FieldValue label={tr("営業担当")} value={entry.salesRepName} />
        <FieldValue label={tr("作成者")} value={entry.createdBy} />
      </SummaryGrid>

      <AppTabs onChange={setTab} value={tab}>
        <Tabs.List>
          <Tabs.Tab value="prices">{tr("価格設定")}</Tabs.Tab>
          <Tabs.Tab value="discounts">{tr("値引き設定")}</Tabs.Tab>
          <Tabs.Tab value="related">{tr("関連")}</Tabs.Tab>
          <Tabs.Tab value="comments">{tr("コメント")}</Tabs.Tab>
          <Tabs.Tab value="history">{tr("履歴")}</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel pt="md" value="prices">
          <Group justify="flex-end" mb="sm">
            <SecondaryButton
              leftSection={<IconPlus size={16} />}
              onClick={() => router.push(`${BASE_PATH}/${entry.entryId}/edit`)}
            >
              {tr("注文種別を追加")}
            </SecondaryButton>
          </Group>

          <Stack gap="lg">
            {entry.variants.map((variant) => (
              <div key={variant.id}>
                <Group justify="space-between" mb={4} wrap="wrap">
                  {variantHeading(variant)}
                  <Group gap="md" wrap="nowrap">
                    <Text c="dimmed" size="xs">
                      {tr("基準単価")}{" "}
                      <MoneyText value={variant.baseUnitPrice} />
                    </Text>
                    {variant.estimateId ? (
                      <Anchor
                        onClick={() =>
                          router.push(
                            `/sales/trial-estimates/${variant.estimateId}`,
                          )
                        }
                        size="xs"
                      >
                        <DocNumber c="blue">{variant.estimateNumber}</DocNumber>
                      </Anchor>
                    ) : (
                      <Text c="dimmed" size="xs">
                        {tr("手動設定")}
                      </Text>
                    )}
                  </Group>
                </Group>
                <Table.ScrollContainer minWidth={480}>
                  <Table>
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th>{tr("数量範囲")}</Table.Th>
                        <Table.Th ta="right">{tr("倍率")}</Table.Th>
                        <Table.Th ta="right">{tr("単価")}</Table.Th>
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {variant.tiers.map((tier) => (
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
                                  {tr("手動")}
                                </Badge>
                              )}
                              <MoneyText
                                currency={entry.currency}
                                value={tierUnitPrice(variant, tier)}
                              />
                            </Group>
                          </Table.Td>
                        </Table.Tr>
                      ))}
                    </Table.Tbody>
                  </Table>
                </Table.ScrollContainer>
              </div>
            ))}
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel pt="md" value="discounts">
          <Text c="dimmed" mb="sm" size="xs">
            {tr(
              tr(
                tr(
                  "期間・数量条件を満たすルールが見積書作成時に自動適用されます（複数該当時は値引き額が最大のもの）。ルールは注文種別ごとに登録します。",
                ),
              ),
            )}
          </Text>
          <Stack gap="lg">
            {entry.variants.map((variant) => (
              <div key={variant.id}>
                <Group justify="space-between" mb={4} wrap="wrap">
                  {variantHeading(variant)}
                  <SecondaryButton
                    leftSection={<IconPlus size={16} />}
                    onClick={() => {
                      setDiscountVariantId(variant.id);
                      setDiscountEditTarget(null);
                      setDiscountModalOpen(true);
                    }}
                    size="xs"
                  >
                    {tr("値引きルールを追加")}
                  </SecondaryButton>
                </Group>
                {variant.discounts.length > 0 ? (
                  <Table.ScrollContainer minWidth={720}>
                    <Table>
                      <Table.Thead>
                        <Table.Tr>
                          <Table.Th>{tr("名称")}</Table.Th>
                          <Table.Th ta="right">{tr("値引き")}</Table.Th>
                          <Table.Th>{tr("数量条件")}</Table.Th>
                          <Table.Th>{tr("有効期間")}</Table.Th>
                          <Table.Th>{tr("状態")}</Table.Th>
                          <Table.Th w={88} />
                        </Table.Tr>
                      </Table.Thead>
                      <Table.Tbody>
                        {variant.discounts.map((d) => (
                          <Table.Tr key={d.id}>
                            <Table.Td>
                              <Text fw={500} size="sm">
                                {d.label}
                              </Text>
                            </Table.Td>
                            <Table.Td ta="right">
                              <Text
                                className="tabular-nums"
                                ff="mono"
                                size="sm"
                              >
                                {discountValueLabel(d)}
                              </Text>
                            </Table.Td>
                            <Table.Td>
                              {quantityRange(d.minQuantity, d.maxQuantity)}
                            </Table.Td>
                            <Table.Td>
                              <Text
                                c="dimmed"
                                className="tabular-nums"
                                size="xs"
                              >
                                {validPeriod(fmt, d.validFrom, d.validUntil)}
                              </Text>
                            </Table.Td>
                            <Table.Td>
                              <ActiveBadge active={d.isActive} />
                            </Table.Td>
                            <Table.Td>
                              <Group gap={4} justify="flex-end" wrap="nowrap">
                                <ActionIcon
                                  aria-label={tr("値引きルールを編集")}
                                  onClick={() => {
                                    setDiscountVariantId(variant.id);
                                    setDiscountEditTarget(d);
                                    setDiscountModalOpen(true);
                                  }}
                                  variant="subtle"
                                >
                                  <IconEdit size={16} />
                                </ActionIcon>
                                <ActionIcon
                                  aria-label={tr("値引きルールを削除")}
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
                    {tr("値引きルールがありません。")}
                  </Text>
                )}
                <Divider mt="md" />
              </div>
            ))}
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel pt="md" value="related">
          <Stack gap="md">
            <div>
              <Text c="dimmed" mb={4} size="xs">
                {tr("価格試算元（注文種別ごと）")}
              </Text>
              {estimateVariants.length > 0 ? (
                <Stack gap={4}>
                  {estimateVariants.map((v) => (
                    <Group gap="xs" key={v.id}>
                      <Badge color="gray" size="xs" variant="light">
                        {ORDER_TYPE_LABEL[v.orderType] ?? v.orderType}
                      </Badge>
                      <Anchor
                        onClick={() =>
                          router.push(`/sales/trial-estimates/${v.estimateId}`)
                        }
                        size="sm"
                      >
                        <DocNumber c="blue">{v.estimateNumber}</DocNumber>
                      </Anchor>
                    </Group>
                  ))}
                </Stack>
              ) : (
                <Text c="dimmed" size="sm">
                  {tr("手動登録")}
                </Text>
              )}
            </div>

            <div>
              <Text c="dimmed" mb={4} size="xs">
                {tr("この価格表から作成した見積書")}
              </Text>
              {relatedQuotes.length > 0 ? (
                <Table.ScrollContainer minWidth={520}>
                  <Table>
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th>{tr("見積番号")}</Table.Th>
                        <Table.Th ta="right">{tr("数量")}</Table.Th>
                        <Table.Th ta="right">{tr("金額")}</Table.Th>
                        <Table.Th>{tr("状態")}</Table.Th>
                        <Table.Th>{tr("作成日")}</Table.Th>
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
                              {fmt.date(q.createdAt)}
                            </Text>
                          </Table.Td>
                        </Table.Tr>
                      ))}
                    </Table.Tbody>
                  </Table>
                </Table.ScrollContainer>
              ) : (
                <Text c="dimmed" size="sm">
                  {tr(
                    tr(
                      tr(
                        "—（「見積書を作成」でこの価格表から見積書を作成できます）",
                      ),
                    ),
                  )}
                </Text>
              )}
            </div>
          </Stack>
        </Tabs.Panel>

        {/* keepMounted={false}: エディタ（prosemirror）はタブを開くまで読み込まない。 */}
        <Tabs.Panel keepMounted={false} pt="md" value="comments">
          <MemoPanel
            memos={memos}
            mode="comment"
            ownerId={entry.entryId}
            ownerType="price_list_entries"
          />
        </Tabs.Panel>

        <Tabs.Panel pt="md" value="history">
          <HistoryPanel entries={auditEntries} />
        </Tabs.Panel>
      </AppTabs>

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
