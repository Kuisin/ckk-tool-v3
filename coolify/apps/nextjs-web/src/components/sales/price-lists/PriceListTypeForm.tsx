"use client";

/**
 * PriceListTypeForm — 価格表 新規作成 / 編集 (顧客×製品, design.md §8.3).
 *
 * One page edits ONE (顧客, 製品) entry with its 注文種別バリアント一式。
 * バリアントごとに: 基準単価（製品にリンクされた確定済み価格試算をソースに選択、
 * 手動上書き可）+ 有効期間 + 状態 + quantity tiers（数量範囲 → ×倍率。単価 =
 * 基準単価 × 倍率、行ごとに手動上書き可）. The (顧客, 製品) keys are the
 * identity of the entry and are LOCKED after creation; 注文種別 is locked per
 * saved variant. Persists via updatePriceEntry / createPriceEntry.
 */

import {
  ActionIcon,
  Alert,
  Anchor,
  Checkbox,
  Group,
  NumberInput,
  Select,
  SimpleGrid,
  Switch,
  Table,
  Text,
} from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";
import {
  IconAlertTriangle,
  IconCalendar,
  IconPlus,
  IconTrash,
} from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState, useTransition } from "react";
import { z } from "zod";
import {
  searchCustomerOptions,
  searchProductOptions,
} from "@/app/(dashboard)/_shared/option-search";
import {
  createPriceEntry,
  fetchEstimateSources,
  type PriceVariantInput,
  updatePriceEntry,
} from "@/app/(dashboard)/sales/price-lists/actions";
import type { EstimateSource } from "@/app/(dashboard)/sales/price-lists/data";
import { GhostButton } from "@/components/ui/buttons";
import { FieldValue } from "@/components/ui/FieldValue";
import { customerF4, productF4 } from "@/components/ui/f4-presets";
import { HelpLabel } from "@/components/ui/HelpLabel";
import { openConfirm } from "@/components/ui/modals";
import { SalesRepSelect } from "@/components/ui/SalesRepSelect";
import { SearchSelect } from "@/components/ui/SearchSelect";
import { FormSection, FormShell } from "@/components/ui/shells";
import { fieldHelp } from "@/lib/field-help";
import { zodResolver } from "@/lib/form";
import { formatMoney } from "@/lib/format";
import type { Option } from "@/lib/mock";
import { ORDER_TYPE_LABEL, ORDER_TYPE_OPTIONS } from "@/lib/mock";
import {
  type EntryIdentity,
  type PriceListEntry,
  requiresEndDate,
} from "./model";

/**
 * バリデーションメッセージが訳を必要とするため、スキーマはコンポーネント内で
 * `tr` を受け取って組み立てる（型だけはモジュールスコープで使えるよう
 * `ReturnType` から導出する）。
 */
function buildSchema(tr: ReturnType<typeof useTranslations>) {
  const tierSchema = z.object({
    minQuantity: z
      .number()
      .int()
      .min(1, tr("sales.priceListTypeForm.atLeast1")),
    maxQuantity: z.number().int().nullable(),
    /** 数量倍率（×1.01 など）. */
    multiplier: z
      .number()
      .min(0.01, tr("sales.priceListTypeForm.multiplierMustBePositive")),
    /** 手動上書き単価（null = 基準単価 × 倍率）. */
    priceOverride: z.number().min(0).nullable(),
  });

  const variantFormSchema = z.object({
    /** 保存済みバリアントの id（新規は null）. */
    id: z.string().nullable(),
    orderType: z.enum(["PRODUCTION", "TEST", "SAMPLE", "OTHER"]),
    /** 基準単価ソースの価格試算番号（null = 手動設定）. */
    sourceEstimate: z.string().nullable(),
    /** 価格試算値を使わず手動の基準単価を使う（送信時に除去）. */
    customBase: z.boolean(),
    baseUnitPrice: z.number().min(0),
    validFrom: z.string().min(1, tr("sales.priceLists.selectAStartDate")),
    validUntil: z.string().nullable(),
    isActive: z.boolean(),
    tiers: z
      .array(tierSchema)
      .min(1, tr("sales.priceListTypeForm.addAtLeastOneTier")),
  });

  return z
    .object({
      customerId: z
        .string()
        .min(1, tr("sales.orderAcceptances.selectACustomer")),
      productId: z.string().min(1, tr("common.selectAProduct")),
      /** 営業担当 — 顧客の担当一覧から選ぶ（未設定なら主担当が既定で入る）。 */
      salesRepId: z.string().nullable(),
      isActive: z.boolean(),
      variants: z
        .array(variantFormSchema)
        .min(1, tr("sales.priceListTypeForm.addAtLeastOneOrderTypePrice")),
    })
    .superRefine((val, ctx) => {
      const seen = new Set<string>();
      val.variants.forEach((v, i) => {
        if (seen.has(v.orderType)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["variants", i, "orderType"],
            message: tr("sales.priceLists.theSameOrderTypeAppearsTwice"),
          });
        }
        seen.add(v.orderType);
        if (requiresEndDate(v.orderType) && !v.validUntil) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["variants", i, "validUntil"],
            message: tr("common.testAndSamplePricesNeedAn"),
          });
        }
      });
    });
}

type FormValues = z.infer<ReturnType<typeof buildSchema>>;
type VariantForm = FormValues["variants"][number];
type TierForm = VariantForm["tiers"][number];

const BASE_PATH = "/sales/price-lists";

const emptyTier = (): TierForm => ({
  minQuantity: 1,
  maxQuantity: null,
  multiplier: 1,
  priceOverride: null,
});

const emptyVariant = (orderType: VariantForm["orderType"]): VariantForm => ({
  id: null,
  orderType,
  sourceEstimate: null,
  customBase: true,
  baseUnitPrice: 0,
  validFrom: "",
  validUntil: null,
  isActive: true,
  tiers: [emptyTier()],
});

function buildInitial(args: {
  entry?: PriceListEntry | null;
  estimateBases: Record<string, number>;
  lockedCustomerId?: string;
  lockedProductId?: string;
}): FormValues {
  const entry = args.entry;
  if (entry) {
    return {
      customerId: entry.customerId,
      productId: entry.productId,
      salesRepId: entry.salesRepId,
      isActive: entry.isActive,
      variants: entry.variants.map((v) => {
        const base = v.estimateNumber
          ? (args.estimateBases[v.estimateNumber] ?? null)
          : null;
        return {
          id: v.id,
          orderType: v.orderType as VariantForm["orderType"],
          sourceEstimate: v.estimateNumber,
          customBase: base == null || v.baseUnitPrice !== base,
          baseUnitPrice: v.baseUnitPrice,
          validFrom: v.validFrom,
          validUntil: v.validUntil,
          isActive: v.isActive,
          tiers: v.tiers.map((t) => ({
            minQuantity: t.minQuantity,
            maxQuantity: t.maxQuantity,
            multiplier: t.multiplier,
            priceOverride: t.priceOverride,
          })),
        };
      }),
    };
  }
  return {
    customerId: args.lockedCustomerId ?? "",
    productId: args.lockedProductId ?? "",
    salesRepId: null,
    isActive: true,
    variants: [emptyVariant("PRODUCTION")],
  };
}

export function PriceListTypeForm({
  mode,
  entry,
  lockedCustomerId,
  lockedProductId,
  estimateBases = {},
  customerOption,
  productOption,
  existingEntries,
}: {
  mode: "create" | "edit";
  /** Edit: the entry (server-fetched view-model). */
  entry?: PriceListEntry | null;
  /** Create: 顧客/製品 prefilled+locked（`?customer&product` リンク経由）. */
  lockedCustomerId?: string;
  lockedProductId?: string;
  /** 既存バリアントの価格試算番号 → 見積単価（基準単価のロック値）. */
  estimateBases?: Record<string, number>;
  /** ロック時の表示ラベル（未ロック時は SearchSelect が検索する）. */
  customerOption?: Option | null;
  productOption?: Option | null;
  /** All current (顧客, 製品) identities — duplicate warnings. */
  existingEntries: EntryIdentity[];
}) {
  const tr = useTranslations();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const entryId = entry?.entryId;

  // 顧客/製品 are locked when editing or prefilled from an existing link.
  const lockCustomerProduct =
    mode === "edit" || Boolean(lockedCustomerId && lockedProductId);

  const form = useForm<FormValues>({
    validate: zodResolver(buildSchema(tr)),
    initialValues: buildInitial({
      entry,
      estimateBases,
      lockedCustomerId,
      lockedProductId,
    }),
  });

  // ── 製品にリンクされた価格試算（基準単価ソース候補）────────────────────────────
  const [sources, setSources] = useState<EstimateSource[]>([]);
  const productId = form.values.productId;
  useEffect(() => {
    if (!productId) {
      setSources([]);
      return;
    }
    let cancelled = false;
    fetchEstimateSources(productId).then((result) => {
      if (!cancelled) setSources(result.ok ? result.data : []);
    });
    return () => {
      cancelled = true;
    };
  }, [productId]);

  /** バリアントの基準単価ロック値（価格試算ソース選択時のみ）。 */
  const baseOf = (v: VariantForm): number | null => {
    if (!v.sourceEstimate) return null;
    return (
      estimateBases[v.sourceEstimate] ??
      sources.find((s) => s.number === v.sourceEstimate)?.unitPrice ??
      null
    );
  };

  /** カスタム基準単価の ON/OFF — どちらの向きも確認ポップアップを挟む。 */
  const toggleCustomBase = (vi: number, next: boolean) => {
    const estimateBase = baseOf(form.values.variants[vi]);
    if (estimateBase == null) return; // 価格試算ソースなし: 常に手動
    if (next) {
      openConfirm({
        title: tr("sales.priceLists.useACustomBaseUnitPrice"),
        message: tr("sales.priceListTypeForm.confirmUseCustomBaseMessage", {
          price: formatMoney(estimateBase),
        }),
        confirmLabel: tr("common.customize"),
        onConfirm: () => form.setFieldValue(`variants.${vi}.customBase`, true),
      });
    } else {
      openConfirm({
        title: tr("sales.priceLists.backToTheEstimatedValue"),
        message: tr("sales.priceListTypeForm.confirmBackToEstimatedMessage", {
          price: formatMoney(estimateBase),
        }),
        confirmLabel: tr("sales.priceLists.backToTheEstimatedValue"),
        onConfirm: () => {
          form.setFieldValue(`variants.${vi}.customBase`, false);
          form.setFieldValue(`variants.${vi}.baseUnitPrice`, estimateBase);
        },
      });
    }
  };

  /** 数量帯ごとのカスタム単価 ON/OFF — 確認ポップアップを挟む。 */
  const toggleTierOverride = (
    vi: number,
    ri: number,
    next: boolean,
    autoPrice: number,
  ) => {
    const path = `variants.${vi}.tiers.${ri}.priceOverride`;
    if (next) {
      openConfirm({
        title: tr("sales.priceLists.useACustomUnitPrice"),
        message: tr("sales.priceListTypeForm.confirmUseCustomTierMessage", {
          price: formatMoney(autoPrice),
        }),
        confirmLabel: tr("common.customize"),
        onConfirm: () => form.setFieldValue(path, autoPrice),
      });
    } else {
      openConfirm({
        title: tr("sales.priceLists.backToAutomaticCalculation"),
        message: tr("sales.priceListTypeForm.confirmBackToAutoTierMessage", {
          price: formatMoney(autoPrice),
        }),
        confirmLabel: tr("sales.priceLists.backToAutomaticCalculation"),
        onConfirm: () => form.setFieldValue(path, null),
      });
    }
  };

  const handleSubmit = (raw: FormValues) => {
    const variants: PriceVariantInput[] = raw.variants.map((v) => {
      const estimateBase = baseOf(v);
      return {
        id: v.id,
        orderType: v.orderType,
        // カスタム未使用時は必ず価格試算値を採用する（バイパスは明示チェックのみ）。
        baseUnitPrice:
          !v.customBase && estimateBase != null
            ? estimateBase
            : v.baseUnitPrice,
        validFrom: v.validFrom,
        validUntil: v.validUntil,
        isActive: v.isActive,
        estimateNumber: v.sourceEstimate,
        tiers: v.tiers,
      };
    });
    startTransition(async () => {
      const result =
        mode === "edit" && entryId
          ? await updatePriceEntry({
              entryNumber: entryId,
              isActive: raw.isActive,
              salesRepId: raw.salesRepId,
              variants,
            })
          : await createPriceEntry({
              identity: {
                customerBpId: raw.customerId,
                productId: raw.productId,
              },
              salesRepId: raw.salesRepId,
              variants,
            });
      if (result.ok) {
        notifications.show({
          title: tr("common.saved2"),
          message:
            mode === "edit"
              ? tr("sales.priceLists.thePriceListWasUpdated")
              : tr("sales.priceLists.thePriceListWasCreated"),
          color: "green",
        });
        // 作成・更新後は対象エントリの詳細（ビュー）ページへ。
        router.push(`${BASE_PATH}/${result.data.entryId}`);
      } else {
        notifications.show({
          title: tr("common.error2"),
          message: result.error,
          color: "red",
        });
      }
    });
  };

  const duplicateEntry =
    mode === "create"
      ? (existingEntries.find(
          (e) =>
            e.customerBpId === form.values.customerId &&
            e.productId === form.values.productId,
        ) ?? null)
      : null;

  const sourceOptions: Option[] = sources.map((s) => ({
    value: s.number,
    label: `${s.number} ${s.name}（${formatMoney(s.unitPrice)}）`,
  }));

  return (
    <FormShell
      breadcrumbs={[
        tr("common.sales"),
        { label: tr("common.priceList"), href: BASE_PATH },
        mode === "edit" ? tr("common.edit") : tr("common.new2"),
      ]}
      isDirty={form.isDirty()}
      isPending={isPending}
      onCancel={() =>
        router.push(entryId ? `${BASE_PATH}/${entryId}` : BASE_PATH)
      }
      onSubmit={form.onSubmit(handleSubmit)}
      title={
        mode === "edit"
          ? tr("sales.priceListTypeForm.editTitle")
          : tr("sales.priceLists.newPriceList")
      }
    >
      {/* Identity keys — editable only on first creation, then locked. */}
      <FormSection
        description={
          lockCustomerProduct
            ? tr("sales.priceLists.theCustomerAndProductCannotBe")
            : tr("sales.priceLists.thereIsOnePriceListPer")
        }
        title={tr("common.target")}
      >
        <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="sm">
          {lockCustomerProduct ? (
            <FieldValue
              label={tr("common.customer")}
              value={customerOption?.label ?? (form.values.customerId || "—")}
            />
          ) : (
            <SearchSelect
              error={form.errors.customerId}
              f4={customerF4(tr)}
              initialOption={customerOption}
              label={<HelpLabel {...fieldHelp("priceList", "customer")} />}
              onChange={(v) => form.setFieldValue("customerId", v ?? "")}
              onSearch={searchCustomerOptions}
              placeholder={tr("common.searchCustomers")}
              storageKey="customer"
              value={form.values.customerId || null}
              withAsterisk
            />
          )}
          {lockCustomerProduct ? (
            <FieldValue
              label={tr("common.product")}
              value={productOption?.label ?? (form.values.productId || "—")}
            />
          ) : (
            <SearchSelect
              error={form.errors.productId}
              f4={productF4(tr)}
              initialOption={productOption}
              label={<HelpLabel {...fieldHelp("priceList", "product")} />}
              onChange={(v) => form.setFieldValue("productId", v ?? "")}
              onSearch={searchProductOptions}
              placeholder={tr("common.searchProducts")}
              storageKey="product"
              value={form.values.productId || null}
              withAsterisk
            />
          )}
          <SalesRepSelect
            customerBpId={form.values.customerId || null}
            initial={
              entry?.salesRepId && entry.salesRepName
                ? { id: entry.salesRepId, name: entry.salesRepName }
                : null
            }
            onChange={(v) => form.setFieldValue("salesRepId", v)}
            value={form.values.salesRepId}
          />
          {mode === "edit" && (
            <Switch
              label={tr("sales.priceLists.enabledWholePriceList")}
              mt={{ base: 0, sm: 28 }}
              {...form.getInputProps("isActive", { type: "checkbox" })}
            />
          )}
        </SimpleGrid>
        {duplicateEntry && (
          <Alert
            color="red"
            icon={<IconAlertTriangle size={16} />}
            mt="sm"
            variant="light"
          >
            {tr("sales.priceListTypeForm.duplicateEntryPrefix")}{" "}
            <Anchor
              href={`${BASE_PATH}/${duplicateEntry.entryId}/edit`}
              size="sm"
            >
              {duplicateEntry.entryId}
            </Anchor>{" "}
            {tr("sales.priceListTypeForm.duplicateEntrySuffix", {
              orderTypes: duplicateEntry.orderTypes
                .map((t) => ORDER_TYPE_LABEL[t] ?? t)
                .join(tr("common.s1")),
            })}
          </Alert>
        )}
        {form.values.productId && sources.length === 0 && (
          <Alert color="gray" mt="sm" variant="light">
            {tr("sales.priceLists.noConfirmedEstimateIsLinkedTo")}
          </Alert>
        )}
      </FormSection>

      {form.values.variants.map((variant, vi) => {
        const estimateBase = baseOf(variant);
        const customBase = variant.customBase || estimateBase == null;
        const savedVariant = Boolean(variant.id);
        return (
          <FormSection
            description={tr("sales.priceLists.theBasePriceComesFromThe")}
            key={form.key(`variants.${vi}`)}
            title={tr("sales.priceListTypeForm.orderTypeSectionTitle", {
              orderType:
                ORDER_TYPE_LABEL[variant.orderType] ?? variant.orderType,
            })}
          >
            <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="sm">
              {savedVariant ? (
                <FieldValue
                  label={tr("common.orderType")}
                  value={ORDER_TYPE_LABEL[variant.orderType]}
                />
              ) : (
                <Select
                  data={ORDER_TYPE_OPTIONS}
                  label={<HelpLabel {...fieldHelp("priceList", "orderType")} />}
                  withAsterisk
                  {...form.getInputProps(`variants.${vi}.orderType`)}
                />
              )}
              {savedVariant ? (
                <FieldValue
                  label={tr("sales.priceLists.priceSourcePriceEstimate")}
                  value={variant.sourceEstimate ?? tr("common.setManually")}
                />
              ) : (
                <Select
                  clearable
                  data={sourceOptions}
                  description={tr(
                    "sales.priceLists.confirmedPriceEstimatesLinkedToThe",
                  )}
                  disabled={sourceOptions.length === 0}
                  label={
                    <HelpLabel
                      {...fieldHelp("priceList", "basePrice", {
                        label: tr("sales.priceLists.priceSourcePriceEstimate"),
                      })}
                    />
                  }
                  onChange={(v) => {
                    form.setFieldValue(`variants.${vi}.sourceEstimate`, v);
                    const src = sources.find((s) => s.number === v);
                    if (src) {
                      form.setFieldValue(
                        `variants.${vi}.baseUnitPrice`,
                        src.unitPrice,
                      );
                      form.setFieldValue(`variants.${vi}.customBase`, false);
                    } else {
                      form.setFieldValue(`variants.${vi}.customBase`, true);
                    }
                  }}
                  placeholder={
                    sourceOptions.length === 0
                      ? tr("sales.priceLists.noPriceEstimateManual")
                      : tr("common.setManually")
                  }
                  value={variant.sourceEstimate}
                />
              )}
              <Group
                align="center"
                gap="md"
                justify="space-between"
                mt={{ base: 0, sm: 26 }}
                wrap="nowrap"
              >
                <Switch
                  label={tr("common.enabled")}
                  {...form.getInputProps(`variants.${vi}.isActive`, {
                    type: "checkbox",
                  })}
                />
                <ActionIcon
                  aria-label={tr("sales.priceLists.deleteThisOrderType")}
                  color="red"
                  disabled={form.values.variants.length <= 1}
                  onClick={() =>
                    openConfirm({
                      title: tr("sales.priceLists.deleteTheOrderType"),
                      message: tr(
                        "sales.priceListTypeForm.confirmDeleteOrderTypeMessage",
                        { orderType: ORDER_TYPE_LABEL[variant.orderType] },
                      ),
                      confirmLabel: tr("common.delete"),
                      onConfirm: () => form.removeListItem("variants", vi),
                    })
                  }
                  variant="subtle"
                >
                  <IconTrash size={16} />
                </ActionIcon>
              </Group>
            </SimpleGrid>

            <SimpleGrid cols={{ base: 1, sm: 3 }} mt="sm" spacing="sm">
              <FieldValue
                label={tr("sales.priceLists.estimatedUnitPricePriceEstimate")}
                value={
                  estimateBase != null
                    ? formatMoney(estimateBase)
                    : tr("sales.priceLists.noPriceEstimateSource")
                }
              />
              <Checkbox
                checked={customBase}
                description={
                  estimateBase == null
                    ? tr("sales.priceLists.manualOnlySinceThereIsNo")
                    : undefined
                }
                disabled={estimateBase == null}
                label={
                  <HelpLabel
                    help={tr("sales.priceLists.byDefaultTheEstimateSUnit")}
                    label={tr("sales.priceLists.useACustomUnitPrice2")}
                  />
                }
                mt={{ base: 0, sm: 26 }}
                onChange={(e) => toggleCustomBase(vi, e.currentTarget.checked)}
              />
              <NumberInput
                description={
                  customBase
                    ? estimateBase != null
                      ? tr("sales.priceListTypeForm.manualWithEstimateValue", {
                          price: formatMoney(estimateBase),
                        })
                      : tr("common.setManually")
                    : tr("sales.priceLists.useTheEstimatedValueAsIt")
                }
                disabled={!customBase}
                label={
                  <HelpLabel
                    help={tr("sales.priceLists.theBaseForThePriceList")}
                    label={
                      <HelpLabel {...fieldHelp("priceList", "basePrice")} />
                    }
                  />
                }
                min={0}
                prefix="¥"
                thousandSeparator=","
                withAsterisk
                {...form.getInputProps(`variants.${vi}.baseUnitPrice`)}
              />
            </SimpleGrid>

            <SimpleGrid cols={{ base: 1, sm: 3 }} mt="sm" spacing="sm">
              <DatePickerInput
                label={<HelpLabel {...fieldHelp("priceList", "validFrom")} />}
                leftSection={<IconCalendar size={14} />}
                placeholder={tr("common.pickADate")}
                valueFormat="YYYY/MM/DD"
                withAsterisk
                {...form.getInputProps(`variants.${vi}.validFrom`)}
              />
              <DatePickerInput
                clearable={!requiresEndDate(variant.orderType)}
                description={
                  requiresEndDate(variant.orderType)
                    ? tr("sales.priceLists.testAndSampleEntriesNeedAn")
                    : undefined
                }
                label={<HelpLabel {...fieldHelp("priceList", "validUntil")} />}
                leftSection={<IconCalendar size={14} />}
                placeholder={
                  requiresEndDate(variant.orderType)
                    ? tr("common.pickADate")
                    : tr("common.leaveBlankForNoEndDate")
                }
                valueFormat="YYYY/MM/DD"
                withAsterisk={requiresEndDate(variant.orderType)}
                {...form.getInputProps(`variants.${vi}.validUntil`)}
              />
            </SimpleGrid>

            <Table mt="sm" withTableBorder>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>{tr("sales.priceLists.minimumQuantity2")}</Table.Th>
                  <Table.Th>{tr("sales.priceLists.maximumQuantity2")}</Table.Th>
                  <Table.Th>
                    <HelpLabel
                      help={tr("sales.priceLists.theMultiplierPerTierEG")}
                      label={
                        <HelpLabel {...fieldHelp("priceList", "multiplier")} />
                      }
                    />
                  </Table.Th>
                  <Table.Th ta="right">
                    <HelpLabel
                      help={tr(
                        "sales.priceLists.automaticallyCalculatedAsBaseUnitPrice",
                      )}
                      label={tr(
                        "sales.priceLists.automaticallyCalculatedUnitPrice",
                      )}
                    />
                  </Table.Th>
                  <Table.Th>
                    <HelpLabel
                      help={tr(
                        "sales.priceLists.tickingItDropsTheAutomaticCalculation",
                      )}
                      label={
                        <HelpLabel {...fieldHelp("priceList", "customPrice")} />
                      }
                    />
                  </Table.Th>
                  <Table.Th ta="right">
                    {tr("sales.priceLists.unitPriceUsed")}
                  </Table.Th>
                  <Table.Th w={48} />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {variant.tiers.map((tier, ri) => {
                  const effectiveBase =
                    !customBase && estimateBase != null
                      ? estimateBase
                      : variant.baseUnitPrice;
                  const autoPrice = Math.round(effectiveBase * tier.multiplier);
                  const isCustom = tier.priceOverride != null;
                  const effective = tier.priceOverride ?? autoPrice;
                  return (
                    <Table.Tr key={form.key(`variants.${vi}.tiers.${ri}`)}>
                      <Table.Td>
                        <NumberInput
                          min={1}
                          {...form.getInputProps(
                            `variants.${vi}.tiers.${ri}.minQuantity`,
                          )}
                        />
                      </Table.Td>
                      <Table.Td>
                        <NumberInput
                          min={1}
                          placeholder={tr("sales.priceLists.noMaximum")}
                          {...form.getInputProps(
                            `variants.${vi}.tiers.${ri}.maxQuantity`,
                          )}
                        />
                      </Table.Td>
                      <Table.Td>
                        <NumberInput
                          decimalScale={2}
                          min={0.01}
                          prefix="×"
                          step={0.01}
                          {...form.getInputProps(
                            `variants.${vi}.tiers.${ri}.multiplier`,
                          )}
                        />
                      </Table.Td>
                      <Table.Td ta="right">
                        <Text
                          c={isCustom ? "dimmed" : undefined}
                          className="tabular-nums"
                          ff="mono"
                          size="sm"
                          td={isCustom ? "line-through" : undefined}
                        >
                          ¥{autoPrice.toLocaleString("ja-JP")}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Group gap="xs" wrap="nowrap">
                          <Checkbox
                            aria-label={tr(
                              "sales.priceLists.useACustomUnitPrice2",
                            )}
                            checked={isCustom}
                            onChange={(e) =>
                              toggleTierOverride(
                                vi,
                                ri,
                                e.currentTarget.checked,
                                autoPrice,
                              )
                            }
                          />
                          <NumberInput
                            disabled={!isCustom}
                            min={0}
                            placeholder={
                              isCustom ? undefined : tr("common.auto")
                            }
                            prefix="¥"
                            thousandSeparator=","
                            {...form.getInputProps(
                              `variants.${vi}.tiers.${ri}.priceOverride`,
                            )}
                            onChange={(v) =>
                              form.setFieldValue(
                                `variants.${vi}.tiers.${ri}.priceOverride`,
                                typeof v === "number" ? v : null,
                              )
                            }
                            value={tier.priceOverride ?? ""}
                          />
                        </Group>
                      </Table.Td>
                      <Table.Td ta="right">
                        <Group gap={6} justify="flex-end" wrap="nowrap">
                          {isCustom && (
                            <Text c="orange" size="xs">
                              {tr("common.manual")}
                            </Text>
                          )}
                          <Text
                            className="tabular-nums"
                            ff="mono"
                            fw={600}
                            size="sm"
                          >
                            ¥{effective.toLocaleString("ja-JP")}
                          </Text>
                        </Group>
                      </Table.Td>
                      <Table.Td>
                        <ActionIcon
                          aria-label={tr("sales.priceLists.removeTheTier")}
                          color="red"
                          disabled={variant.tiers.length <= 1}
                          onClick={() =>
                            form.removeListItem(`variants.${vi}.tiers`, ri)
                          }
                          variant="subtle"
                        >
                          <IconTrash size={16} />
                        </ActionIcon>
                      </Table.Td>
                    </Table.Tr>
                  );
                })}
              </Table.Tbody>
            </Table>
            <GhostButton
              leftSection={<IconPlus size={16} />}
              mt="sm"
              onClick={() =>
                form.insertListItem(`variants.${vi}.tiers`, emptyTier())
              }
              size="xs"
            >
              {tr("sales.priceLists.addATier")}
            </GhostButton>
          </FormSection>
        );
      })}

      <GhostButton
        leftSection={<IconPlus size={16} />}
        onClick={() => {
          const used = new Set<string>(
            form.values.variants.map((v) => v.orderType),
          );
          const next =
            (ORDER_TYPE_OPTIONS.find((o) => !used.has(o.value))
              ?.value as VariantForm["orderType"]) ?? "PRODUCTION";
          form.insertListItem("variants", emptyVariant(next));
        }}
      >
        {tr("common.addAnOrderType")}
      </GhostButton>
    </FormShell>
  );
}
