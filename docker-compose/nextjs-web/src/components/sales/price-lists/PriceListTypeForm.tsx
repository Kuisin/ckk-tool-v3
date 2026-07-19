"use client";

/**
 * PriceListTypeForm — 価格表 編集 / 種別追加 (per 注文種別, design.md §8.3).
 *
 * One page edits ONE (顧客, 製品, 注文種別) entry: 基準単価（試算の見積単価、
 * 手動上書き可）+ 有効期間 + 状態 + quantity tiers（数量範囲 → ×倍率。単価 =
 * 基準単価 × 倍率、行ごとに手動上書き可）. The (顧客, 製品, 注文種別) keys are
 * the identity of the entry and are LOCKED after creation — only 基準単価 /
 * period / tiers are editable. 新規の価格表は試算の「価格表に登録」から作成する。
 * Persists via updatePriceEntry / createPriceEntry (Server Actions).
 */

import {
  ActionIcon,
  Alert,
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
import { useState, useTransition } from "react";
import { z } from "zod";
import {
  searchCustomerOptions,
  searchProductOptions,
} from "@/app/(dashboard)/_shared/option-search";
import {
  createPriceEntry,
  updatePriceEntry,
} from "@/app/(dashboard)/sales/price-lists/actions";
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
  type EntryOrderType,
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

const schema = z
  .object({
    customerId: z.string().min(1, "顧客を選択してください"),
    productId: z.string().min(1, "製品を選択してください"),
    orderType: z.enum(["PRODUCTION", "TEST", "SAMPLE", "OTHER"]),
    currency: z.string().min(1),
    baseUnitPrice: z.number().min(0),
    validFrom: z.string().min(1, "有効開始日を選択してください"),
    validUntil: z.string().nullable(),
    isActive: z.boolean(),
    tiers: z.array(tierSchema).min(1, "段階を1件以上追加してください"),
  })
  .superRefine((val, ctx) => {
    if (requiresEndDate(val.orderType) && !val.validUntil) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["validUntil"],
        message: "テスト・サンプルは有効終了日が必須です",
      });
    }
  });

type TypeFormValues = z.infer<typeof schema>;
type TierForm = TypeFormValues["tiers"][number];

const BASE_PATH = "/sales/price-lists";

const emptyTier = (): TierForm => ({
  minQuantity: 1,
  maxQuantity: null,
  multiplier: 1,
  priceOverride: null,
});

function buildInitial(args: {
  entry?: PriceListEntry | null;
  lockedCustomerId?: string;
  lockedProductId?: string;
}): TypeFormValues {
  const entry = args.entry;
  if (entry) {
    return {
      customerId: entry.customerId,
      productId: entry.productId,
      orderType: entry.orderType as TypeFormValues["orderType"],
      currency: entry.currency,
      baseUnitPrice: entry.baseUnitPrice,
      validFrom: entry.validFrom,
      validUntil: entry.validUntil,
      isActive: entry.isActive,
      tiers: entry.tiers.map((t) => ({
        minQuantity: t.minQuantity,
        maxQuantity: t.maxQuantity,
        multiplier: t.multiplier,
        priceOverride: t.priceOverride,
      })),
    };
  }
  return {
    customerId: args.lockedCustomerId ?? "",
    productId: args.lockedProductId ?? "",
    orderType: "PRODUCTION",
    currency: "JPY",
    baseUnitPrice: 0,
    validFrom: "",
    validUntil: null,
    isActive: true,
    tiers: [emptyTier()],
  };
}

export function PriceListTypeForm({
  mode,
  entry,
  lockedCustomerId,
  lockedProductId,
  estimateBase,
  customerOption,
  productOption,
  existingEntries,
}: {
  mode: "create" | "edit";
  /** Edit: the entry (server-fetched view-model). */
  entry?: PriceListEntry | null;
  /** Create (種別を追加): lock 顧客/製品 to the existing 顧客×製品. */
  lockedCustomerId?: string;
  lockedProductId?: string;
  /** 試算の見積単価（試算元がない種別追加・手動エントリは null）. */
  estimateBase: number | null;
  /** ロック時の表示ラベル（未ロック時は SearchSelect が検索する）. */
  customerOption?: Option | null;
  productOption?: Option | null;
  /** All current (顧客, 製品, 注文種別) identities — duplicate warnings. */
  existingEntries: EntryIdentity[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const entryId = entry?.entryId;

  // 顧客/製品 are locked when editing or adding a type to an existing group.
  const lockCustomerProduct =
    mode === "edit" || Boolean(lockedCustomerId && lockedProductId);
  // 注文種別 is locked only when editing (it's part of the entry identity).
  const lockType = mode === "edit";

  const form = useForm<TypeFormValues>({
    validate: zodResolver(schema),
    initialValues: buildInitial({
      entry,
      lockedCustomerId,
      lockedProductId,
    }),
  });

  // ── 基準単価は試算から取得する（バイパスは明示チェック + 確認のみ）────────
  // 試算元がない場合は手動入力しかできない（チェック固定）。
  const [customBase, setCustomBase] = useState(
    () => estimateBase == null || form.values.baseUnitPrice !== estimateBase,
  );

  /** カスタム基準単価の ON/OFF — どちらの向きも確認ポップアップを挟む。 */
  const toggleCustomBase = (next: boolean) => {
    if (estimateBase == null) return; // 試算元なし: 常に手動
    if (next) {
      openConfirm({
        title: "カスタム基準単価の使用",
        message: `試算の見積単価（${formatMoney(estimateBase)}）を使わず、基準単価を手動で設定します。よろしいですか？`,
        confirmLabel: "カスタム設定する",
        onConfirm: () => setCustomBase(true),
      });
    } else {
      openConfirm({
        title: "試算値に戻す",
        message: `手動で設定した基準単価を破棄し、試算の見積単価（${formatMoney(estimateBase)}）に戻します。`,
        confirmLabel: "試算値に戻す",
        onConfirm: () => {
          setCustomBase(false);
          form.setFieldValue("baseUnitPrice", estimateBase);
        },
      });
    }
  };

  /** 数量帯ごとのカスタム単価 ON/OFF — 確認ポップアップを挟む。 */
  const toggleTierOverride = (ri: number, next: boolean, autoPrice: number) => {
    if (next) {
      openConfirm({
        title: "カスタム単価の使用",
        message: `この数量帯の自動計算単価（${formatMoney(autoPrice)} = 基準単価 × 倍率）を使わず、手動で単価を設定します。`,
        confirmLabel: "カスタム設定する",
        onConfirm: () =>
          form.setFieldValue(`tiers.${ri}.priceOverride`, autoPrice),
      });
    } else {
      openConfirm({
        title: "自動計算に戻す",
        message: `手動で設定した単価を破棄し、自動計算値（${formatMoney(autoPrice)}）に戻します。`,
        confirmLabel: "自動計算に戻す",
        onConfirm: () => form.setFieldValue(`tiers.${ri}.priceOverride`, null),
      });
    }
  };

  const handleSubmit = (raw: TypeFormValues) => {
    // カスタム未使用時は必ず試算値を採用する（バイパスは明示チェックのみ）。
    const values =
      !customBase && estimateBase != null
        ? { ...raw, baseUnitPrice: estimateBase }
        : raw;
    const common = {
      baseUnitPrice: values.baseUnitPrice,
      validFrom: values.validFrom,
      validUntil: values.validUntil,
      isActive: values.isActive,
      tiers: values.tiers,
    };
    startTransition(async () => {
      const result =
        mode === "edit" && entryId
          ? await updatePriceEntry({ entryNumber: entryId, ...common })
          : await createPriceEntry({
              identity: {
                customerBpId: values.customerId,
                productId: values.productId,
                orderType: values.orderType as EntryOrderType,
              },
              ...common,
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
            ? "顧客・製品・注文種別は作成後に変更できません。"
            : undefined
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
          {lockType ? (
            <FieldValue
              label="注文種別"
              value={ORDER_TYPE_LABEL[form.values.orderType]}
            />
          ) : (
            <Select
              data={ORDER_TYPE_OPTIONS}
              label="注文種別"
              withAsterisk
              {...form.getInputProps("orderType")}
            />
          )}
        </SimpleGrid>
        {(() => {
          const existing =
            mode === "edit"
              ? []
              : existingEntries.filter(
                  (e) =>
                    e.customerBpId === form.values.customerId &&
                    e.productId === form.values.productId,
                );
          if (existing.length === 0) return null;
          const dup = existing.some(
            (e) => e.orderType === form.values.orderType,
          );
          return (
            <Alert
              color={dup ? "red" : "orange"}
              icon={<IconAlertTriangle size={16} />}
              mt="sm"
              variant="light"
            >
              同一顧客・製品の価格表が既に {existing.length} 件あります（
              {existing.map((e) => ORDER_TYPE_LABEL[e.orderType]).join("・")}
              ）。
              {dup && " 選択中の注文種別は既に存在します。"}
            </Alert>
          );
        })()}
      </FormSection>

      <FormSection
        description="基準単価は試算の見積単価から取得します。手動上書きは明示的にカスタムを有効化した場合のみ（確認あり）。各段階の単価 = 基準単価 × 倍率。"
        title="基準単価"
      >
        <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="sm">
          <FieldValue
            label="見積単価（試算）"
            value={
              estimateBase != null
                ? formatMoney(estimateBase)
                : "—（試算元なし）"
            }
          />
          <Checkbox
            checked={customBase}
            description={
              estimateBase == null ? "試算元がないため手動設定のみ" : undefined
            }
            disabled={estimateBase == null}
            label={
              <HelpLabel
                help="既定では試算の見積単価をそのまま使います。手動で別の基準単価を設定する場合のみチェックしてください（確認あり）。"
                label="カスタム単価を使用"
              />
            }
            mt={{ base: 0, sm: 26 }}
            onChange={(e) => toggleCustomBase(e.currentTarget.checked)}
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
            {...form.getInputProps("baseUnitPrice")}
          />
        </SimpleGrid>
      </FormSection>

      <FormSection title="有効期間">
        <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="sm">
          <DatePickerInput
            label="有効開始日"
            leftSection={<IconCalendar size={14} />}
            placeholder="日付を選択"
            valueFormat="YYYY/MM/DD"
            withAsterisk
            {...form.getInputProps("validFrom")}
          />
          <DatePickerInput
            clearable={!requiresEndDate(form.values.orderType)}
            description={
              requiresEndDate(form.values.orderType)
                ? "テスト・サンプルは終了日が必須"
                : undefined
            }
            label="有効終了日"
            leftSection={<IconCalendar size={14} />}
            placeholder={
              requiresEndDate(form.values.orderType)
                ? "日付を選択"
                : "空欄で無期限"
            }
            valueFormat="YYYY/MM/DD"
            withAsterisk={requiresEndDate(form.values.orderType)}
            {...form.getInputProps("validUntil")}
          />
          <Switch
            label="有効"
            mt={{ base: 0, sm: 28 }}
            {...form.getInputProps("isActive", { type: "checkbox" })}
          />
        </SimpleGrid>
      </FormSection>

      <FormSection
        description="数量範囲ごとの倍率（×1.01 など）。単価 = 基準単価 × 倍率（試算由来）。カスタム単価はチェックで明示的に有効化した行のみ（確認あり）。すべて同じ有効期間が適用されます。"
        title="数量スケール（倍率）"
      >
        <Table withTableBorder>
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
            {form.values.tiers.map((tier, ri) => {
              const autoPrice = Math.round(
                form.values.baseUnitPrice * tier.multiplier,
              );
              const isCustom = tier.priceOverride != null;
              const effective = tier.priceOverride ?? autoPrice;
              return (
                <Table.Tr key={form.key(`tiers.${ri}`)}>
                  <Table.Td>
                    <NumberInput
                      min={1}
                      {...form.getInputProps(`tiers.${ri}.minQuantity`)}
                    />
                  </Table.Td>
                  <Table.Td>
                    <NumberInput
                      min={1}
                      placeholder="上限なし"
                      {...form.getInputProps(`tiers.${ri}.maxQuantity`)}
                    />
                  </Table.Td>
                  <Table.Td>
                    <NumberInput
                      decimalScale={2}
                      min={0.01}
                      prefix="×"
                      step={0.01}
                      {...form.getInputProps(`tiers.${ri}.multiplier`)}
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
                        {...form.getInputProps(`tiers.${ri}.priceOverride`)}
                        onChange={(v) =>
                          form.setFieldValue(
                            `tiers.${ri}.priceOverride`,
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
                      disabled={form.values.tiers.length <= 1}
                      onClick={() => form.removeListItem("tiers", ri)}
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
          onClick={() => form.insertListItem("tiers", emptyTier())}
          size="xs"
        >
          段階を追加
        </GhostButton>
      </FormSection>
    </FormShell>
  );
}
