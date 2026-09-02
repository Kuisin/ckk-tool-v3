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
import { useTranslations } from "next-intl";
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
  const tr = useTranslations();
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
          title: tr("common.saved2"),
          message: tr("sales.priceListDetail.discountRuleSavedMessage", {
            label: rule.label,
          }),
          color: "green",
        });
        router.refresh();
      } else {
        notifications.show({
          title: tr("common.error2"),
          message: result.error,
          color: "red",
        });
      }
    });
  };

  const removeDiscount = (rule: PriceDiscount) => {
    openConfirm({
      title: tr("sales.priceLists.deleteTheDiscountRule"),
      message: tr("sales.priceListDetail.confirmDeleteDiscountMessage", {
        label: rule.label,
      }),
      confirmLabel: tr("common.delete"),
      onConfirm: () => {
        startTransition(async () => {
          const result = await deleteDiscountRule(entry.entryId, rule.id);
          if (result.ok) {
            router.refresh();
          } else {
            notifications.show({
              title: tr("common.error2"),
              message: result.error,
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
              label: tr("common.createAQuote"),
              icon: <IconFileText size={14} />,
              onClick: () => setQuoteOpen(true),
            },
            {
              label: tr("common.changeTheValidPeriod"),
              icon: <IconCopy size={14} />,
              onClick: () => setDuplicateOpen(true),
            },
            {
              label: tr("common.copyToAnotherCustomerOrProduct"),
              icon: <IconCopyPlus size={14} />,
              onClick: () => setCopyOpen(true),
            },
            {
              label: tr("common.delete"),
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
        tr("common.sales"),
        { label: tr("common.priceList"), href: BASE_PATH },
        tr("common.detailBreadcrumb"),
      ]}
      createdAt={fmt.dateTime(entry.createdAt)}
      status={<ActiveBadge active={entry.isActive} />}
      title={tr("sales.priceLists.priceListDetails")}
      updatedAt={fmt.dateTime(entry.updatedAt)}
    >
      <SummaryGrid>
        <FieldValue label={tr("common.customer")} value={entry.customerName} />
        <FieldValue label={tr("common.product")} value={entry.productName} />
        <FieldValue
          label={tr("common.orderType")}
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
        <FieldValue
          label={tr("sales.priceLists.tiers")}
          value={tr("sales.priceListTable.tierCountLabel", {
            count: summary.tierCount,
          })}
        />
        <FieldValue
          label={tr("sales.priceLists.unitPriceRange")}
          value={priceRangeLabel(summary.minPrice, summary.maxPrice)}
        />
        <FieldValue label={tr("common.salesRep")} value={entry.salesRepName} />
        <FieldValue label={tr("common.createdBy")} value={entry.createdBy} />
      </SummaryGrid>

      <AppTabs onChange={setTab} value={tab}>
        <Tabs.List>
          <Tabs.Tab value="prices">{tr("sales.priceLists.pricing")}</Tabs.Tab>
          <Tabs.Tab value="discounts">
            {tr("sales.priceLists.discountRules")}
          </Tabs.Tab>
          <Tabs.Tab value="related">{tr("common.related")}</Tabs.Tab>
          <Tabs.Tab value="comments">{tr("common.comment")}</Tabs.Tab>
          <Tabs.Tab value="history">{tr("common.history")}</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel pt="md" value="prices">
          <Group justify="flex-end" mb="sm">
            <SecondaryButton
              leftSection={<IconPlus size={16} />}
              onClick={() => router.push(`${BASE_PATH}/${entry.entryId}/edit`)}
            >
              {tr("common.addAnOrderType")}
            </SecondaryButton>
          </Group>

          <Stack gap="lg">
            {entry.variants.map((variant) => (
              <div key={variant.id}>
                <Group justify="space-between" mb={4} wrap="wrap">
                  {variantHeading(variant)}
                  <Group gap="md" wrap="nowrap">
                    <Text c="dimmed" size="xs">
                      {tr("sales.priceLists.baseUnitPrice")}{" "}
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
                        {tr("common.setManually")}
                      </Text>
                    )}
                  </Group>
                </Group>
                <Table.ScrollContainer minWidth={480}>
                  <Table>
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th>{tr("common.quantityRange")}</Table.Th>
                        <Table.Th ta="right">
                          {tr("sales.priceLists.multiplier")}
                        </Table.Th>
                        <Table.Th ta="right">{tr("common.unitPrice")}</Table.Th>
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
                                  {tr("common.manual")}
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
            {tr("sales.priceLists.rulesMeetingThePeriodAndQuantity")}
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
                    {tr("common.addADiscountRule")}
                  </SecondaryButton>
                </Group>
                {variant.discounts.length > 0 ? (
                  <Table.ScrollContainer minWidth={720}>
                    <Table>
                      <Table.Thead>
                        <Table.Tr>
                          <Table.Th>{tr("common.name2")}</Table.Th>
                          <Table.Th ta="right">
                            {tr("common.discount")}
                          </Table.Th>
                          <Table.Th>
                            {tr("sales.priceLists.quantityCondition")}
                          </Table.Th>
                          <Table.Th>{tr("common.validPeriod")}</Table.Th>
                          <Table.Th>{tr("common.status")}</Table.Th>
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
                                  aria-label={tr(
                                    "sales.priceLists.editTheDiscountRule",
                                  )}
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
                                  aria-label={tr(
                                    "sales.priceLists.deleteTheDiscountRule2",
                                  )}
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
                    {tr("sales.priceLists.thereAreNoDiscountRules")}
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
                {tr("sales.priceLists.priceEstimateSourcePerOrderType")}
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
                  {tr("sales.priceLists.registeredManually")}
                </Text>
              )}
            </div>

            <div>
              <Text c="dimmed" mb={4} size="xs">
                {tr("sales.priceLists.quotesCreatedFromThisPriceList")}
              </Text>
              {relatedQuotes.length > 0 ? (
                <Table.ScrollContainer minWidth={520}>
                  <Table>
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th>{tr("common.quoteNumber")}</Table.Th>
                        <Table.Th ta="right">{tr("common.quantity")}</Table.Th>
                        <Table.Th ta="right">{tr("common.amount")}</Table.Th>
                        <Table.Th>{tr("common.status")}</Table.Th>
                        <Table.Th>{tr("common.createdOn")}</Table.Th>
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
                          <Table.Td ta="right">
                            {tr("common.quantityPcs", { quantity: q.quantity })}
                          </Table.Td>
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
                  {tr("sales.priceLists.useCreateAQuoteToBuild")}
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
