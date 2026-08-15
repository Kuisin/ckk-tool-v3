"use client";

/**
 * PriceListTypeForm — 価格表 新規作成 / 編集 (顧客×製品, design.md §8.3).
 *
 * One page edits ONE (顧客, 製品) entry with its 注文種別バリアント一式。
 * バリアントごとに: 基準単価（製品にリンクされた確定済み試算をソースに選択、
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
import { CUSTOMER_F4, PRODUCT_F4 } from "@/components/ui/f4-presets";
import { HelpLabel } from "@/components/ui/HelpLabel";
import { openConfirm } from "@/components/ui/modals";
import { SearchSelect } from "@/components/ui/SearchSelect";
import { FormSection, FormShell } from "@/components/ui/shells";
import { zodResolver } from "@/lib/form";
import { formatMoney } from "@/lib/format";
import type { Option } from "@/lib/mock";
import { ORDER_TYPE_LABEL, ORDER_TYPE_OPTIONS } from "@/lib/mock";
import {
  type EntryIdentity,
  type PriceListEntry,
  requiresEndDate,
} from "./model";

const tierSchema = z.object({
  minQuantity: z.number().int().min(1, "1以上"),
  maxQuantity: z.number().int().nullable(),
  /** 数量倍率（×1.01 など）. */
  multiplier: z.number().min(0.01, "0より大きい倍率"),
  /** 手動上書き単価（null = 基準単価 × 倍率）. */
  priceOverride: z.number().min(0).nullable(),
});

const variantFormSchema = z.object({
  /** 保存済みバリアントの id（新規は null）. */
  id: z.string().nullable(),
  orderType: z.enum(["PRODUCTION", "TEST", "SAMPLE", "OTHER"]),
  /** 基準単価ソースの試算番号（null = 手動設定）. */
  sourceEstimate: z.string().nullable(),
  /** 試算値を使わず手動の基準単価を使う（送信時に除去）. */
  customBase: z.boolean(),
  baseUnitPrice: z.number().min(0),
  validFrom: z.string().min(1, "有効開始日を選択してください"),
  validUntil: z.string().nullable(),
  isActive: z.boolean(),
  tiers: z.array(tierSchema).min(1, "段階を1件以上追加してください"),
});

const schema = z
  .object({
    customerId: z.string().min(1, "顧客を選択してください"),
    productId: z.string().min(1, "製品を選択してください"),
    isActive: z.boolean(),
    variants: z
      .array(variantFormSchema)
      .min(1, "注文種別の価格を1件以上追加してください"),
  })
  .superRefine((val, ctx) => {
    const seen = new Set<string>();
    val.variants.forEach((v, i) => {
      if (seen.has(v.orderType)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["variants", i, "orderType"],
          message: "同じ注文種別が重複しています",
        });
      }
      seen.add(v.orderType);
      if (requiresEndDate(v.orderType) && !v.validUntil) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["variants", i, "validUntil"],
          message: "テスト・サンプルは有効終了日が必須です",
        });
      }
    });
  });

type FormValues = z.infer<typeof schema>;
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
  /** 既存バリアントの試算番号 → 見積単価（基準単価のロック値）. */
  estimateBases?: Record<string, number>;
  /** ロック時の表示ラベル（未ロック時は SearchSelect が検索する）. */
  customerOption?: Option | null;
  productOption?: Option | null;
  /** All current (顧客, 製品) identities — duplicate warnings. */
  existingEntries: EntryIdentity[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const entryId = entry?.entryId;

  // 顧客/製品 are locked when editing or prefilled from an existing link.
  const lockCustomerProduct =
    mode === "edit" || Boolean(lockedCustomerId && lockedProductId);

  const form = useForm<FormValues>({
    validate: zodResolver(schema),
    initialValues: buildInitial({
      entry,
      estimateBases,
      lockedCustomerId,
      lockedProductId,
    }),
  });

  // ── 製品にリンクされた試算（基準単価ソース候補）────────────────────────────
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

  /** バリアントの基準単価ロック値（試算ソース選択時のみ）。 */
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
    if (estimateBase == null) return; // 試算ソースなし: 常に手動
    if (next) {
      openConfirm({
        title: "カスタム基準単価の使用",
        message: `試算の見積単価（${formatMoney(estimateBase)}）を使わず、基準単価を手動で設定します。よろしいですか？`,
        confirmLabel: "カスタム設定する",
        onConfirm: () => form.setFieldValue(`variants.${vi}.customBase`, true),
      });
    } else {
      openConfirm({
        title: "試算値に戻す",
        message: `手動で設定した基準単価を破棄し、試算の見積単価（${formatMoney(estimateBase)}）に戻します。`,
        confirmLabel: "試算値に戻す",
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
        title: "カスタム単価の使用",
        message: `この数量帯の自動計算単価（${formatMoney(autoPrice)} = 基準単価 × 倍率）を使わず、手動で単価を設定します。`,
        confirmLabel: "カスタム設定する",
        onConfirm: () => form.setFieldValue(path, autoPrice),
      });
    } else {
      openConfirm({
        title: "自動計算に戻す",
        message: `手動で設定した単価を破棄し、自動計算値（${formatMoney(autoPrice)}）に戻します。`,
        confirmLabel: "自動計算に戻す",
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
        // カスタム未使用時は必ず試算値を採用する（バイパスは明示チェックのみ）。
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
              variants,
            })
          : await createPriceEntry({
              identity: {
                customerBpId: raw.customerId,
                productId: raw.productId,
              },
              variants,
            });
      if (result.ok) {
        notifications.show({
          title: "保存しました",
          message:
            mode === "edit" ? "価格表を更新しました" : "価格表を作成しました",
          color: "green",
        });
        // 作成・更新後は対象エントリの詳細（ビュー）ページへ。
        router.push(`${BASE_PATH}/${result.data.entryId}`);
      } else {
        notifications.show({
          title: "エラー",
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
        "販売",
        { label: "価格表", href: BASE_PATH },
        mode === "edit" ? "編集" : "新規作成",
      ]}
      isDirty={form.isDirty()}
      isPending={isPending}
      onCancel={() =>
        router.push(entryId ? `${BASE_PATH}/${entryId}` : BASE_PATH)
      }
      onSubmit={form.onSubmit(handleSubmit)}
      title={mode === "edit" ? "価格表 編集" : "価格表 新規作成"}
    >
      {/* Identity keys — editable only on first creation, then locked. */}
      <FormSection
        description={
          lockCustomerProduct
            ? "顧客・製品は作成後に変更できません。"
            : "1つの顧客×製品につき価格表は1件です。注文種別ごとの価格は下で追加します。"
        }
        title="対象"
      >
        <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="sm">
          {lockCustomerProduct ? (
            <FieldValue
              label="顧客"
              value={customerOption?.label ?? (form.values.customerId || "—")}
            />
          ) : (
            <SearchSelect
              error={form.errors.customerId}
              f4={CUSTOMER_F4}
              initialOption={customerOption}
              label="顧客"
              onChange={(v) => form.setFieldValue("customerId", v ?? "")}
              onSearch={searchCustomerOptions}
              placeholder="顧客を検索"
              storageKey="customer"
              value={form.values.customerId || null}
              withAsterisk
            />
          )}
          {lockCustomerProduct ? (
            <FieldValue
              label="製品"
              value={productOption?.label ?? (form.values.productId || "—")}
            />
          ) : (
            <SearchSelect
              error={form.errors.productId}
              f4={PRODUCT_F4}
              initialOption={productOption}
              label="製品"
              onChange={(v) => form.setFieldValue("productId", v ?? "")}
              onSearch={searchProductOptions}
              placeholder="製品を検索"
              storageKey="product"
              value={form.values.productId || null}
              withAsterisk
            />
          )}
          {mode === "edit" && (
            <Switch
              label="有効（価格表全体）"
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
            この顧客×製品の価格表{" "}
            <Anchor
              href={`${BASE_PATH}/${duplicateEntry.entryId}/edit`}
              size="sm"
            >
              {duplicateEntry.entryId}
            </Anchor>{" "}
            が既に存在します（
            {duplicateEntry.orderTypes
              .map((t) => ORDER_TYPE_LABEL[t] ?? t)
              .join("・")}
            ）。注文種別の追加は既存の価格表を編集してください。
          </Alert>
        )}
        {form.values.productId && sources.length === 0 && (
          <Alert color="gray" mt="sm" variant="light">
            この製品にリンクされた確定済みの試算はありません。基準単価は手動で設定します（試算（SA01）で製品を指定して確定すると、ここで選択できます）。
          </Alert>
        )}
      </FormSection>

      {form.values.variants.map((variant, vi) => {
        const estimateBase = baseOf(variant);
        const customBase = variant.customBase || estimateBase == null;
        const savedVariant = Boolean(variant.id);
        return (
          <FormSection
            description="基準単価は試算の見積単価から取得します。手動上書きは明示的にカスタムを有効化した場合のみ（確認あり）。各段階の単価 = 基準単価 × 倍率。"
            key={form.key(`variants.${vi}`)}
            title={`注文種別: ${ORDER_TYPE_LABEL[variant.orderType] ?? variant.orderType}`}
          >
            <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="sm">
              {savedVariant ? (
                <FieldValue
                  label="注文種別"
                  value={ORDER_TYPE_LABEL[variant.orderType]}
                />
              ) : (
                <Select
                  data={ORDER_TYPE_OPTIONS}
                  label="注文種別"
                  withAsterisk
                  {...form.getInputProps(`variants.${vi}.orderType`)}
                />
              )}
              {savedVariant ? (
                <FieldValue
                  label="価格ソース（試算）"
                  value={variant.sourceEstimate ?? "手動設定"}
                />
              ) : (
                <Select
                  clearable
                  data={sourceOptions}
                  description="製品にリンクされた確定済み試算"
                  disabled={sourceOptions.length === 0}
                  label="価格ソース（試算）"
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
                    sourceOptions.length === 0 ? "試算なし（手動）" : "手動設定"
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
                  label="有効"
                  {...form.getInputProps(`variants.${vi}.isActive`, {
                    type: "checkbox",
                  })}
                />
                <ActionIcon
                  aria-label="この注文種別を削除"
                  color="red"
                  disabled={form.values.variants.length <= 1}
                  onClick={() =>
                    openConfirm({
                      title: "注文種別の削除",
                      message: `${ORDER_TYPE_LABEL[variant.orderType]} の価格（数量段階・値引きルール含む）を削除します。保存時に反映されます。`,
                      confirmLabel: "削除",
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
                label="見積単価（試算）"
                value={
                  estimateBase != null
                    ? formatMoney(estimateBase)
                    : "—（試算ソースなし）"
                }
              />
              <Checkbox
                checked={customBase}
                description={
                  estimateBase == null
                    ? "試算ソースがないため手動設定のみ"
                    : undefined
                }
                disabled={estimateBase == null}
                label={
                  <HelpLabel
                    help="既定では試算の見積単価をそのまま使います。手動で別の基準単価を設定する場合のみチェックしてください（確認あり）。"
                    label="カスタム単価を使用"
                  />
                }
                mt={{ base: 0, sm: 26 }}
                onChange={(e) => toggleCustomBase(vi, e.currentTarget.checked)}
              />
              <NumberInput
                description={
                  customBase
                    ? estimateBase != null
                      ? `手動設定（試算値: ${formatMoney(estimateBase)}）`
                      : "手動設定"
                    : "試算値をそのまま使用"
                }
                disabled={!customBase}
                label={
                  <HelpLabel
                    help="価格表の基準になる単価。既定は試算の見積単価。各数量帯の単価 = 基準単価 × 倍率。"
                    label="基準単価"
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
                label="有効開始日"
                leftSection={<IconCalendar size={14} />}
                placeholder="日付を選択"
                valueFormat="YYYY/MM/DD"
                withAsterisk
                {...form.getInputProps(`variants.${vi}.validFrom`)}
              />
              <DatePickerInput
                clearable={!requiresEndDate(variant.orderType)}
                description={
                  requiresEndDate(variant.orderType)
                    ? "テスト・サンプルは終了日が必須"
                    : undefined
                }
                label="有効終了日"
                leftSection={<IconCalendar size={14} />}
                placeholder={
                  requiresEndDate(variant.orderType)
                    ? "日付を選択"
                    : "空欄で無期限"
                }
                valueFormat="YYYY/MM/DD"
                withAsterisk={requiresEndDate(variant.orderType)}
                {...form.getInputProps(`variants.${vi}.validUntil`)}
              />
            </SimpleGrid>

            <Table mt="sm" withTableBorder>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>最小数量</Table.Th>
                  <Table.Th>最大数量</Table.Th>
                  <Table.Th>
                    <HelpLabel
                      help="数量帯ごとの掛け率（例 ×1.05 = 基準単価の5%増し）。単価 = 基準単価 × 倍率。"
                      label="倍率"
                    />
                  </Table.Th>
                  <Table.Th ta="right">
                    <HelpLabel
                      help="基準単価（試算由来）× 倍率 の自動計算値。"
                      label="自動計算単価"
                    />
                  </Table.Th>
                  <Table.Th>
                    <HelpLabel
                      help="チェックすると自動計算を使わず、この数量帯だけ手動の固定単価にできます（確認あり）。"
                      label="カスタム単価"
                    />
                  </Table.Th>
                  <Table.Th ta="right">採用単価</Table.Th>
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
                          placeholder="上限なし"
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
                            aria-label="カスタム単価を使用"
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
                            placeholder={isCustom ? undefined : "自動計算"}
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
                              手動
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
                          aria-label="段階を削除"
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
              段階を追加
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
        注文種別を追加
      </GhostButton>
    </FormShell>
  );
}
