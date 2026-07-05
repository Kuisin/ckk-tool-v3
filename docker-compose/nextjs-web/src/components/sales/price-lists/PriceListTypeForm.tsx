"use client";

/**
 * PriceListTypeForm — 価格表 編集 / 種別追加 (per 注文種別, design.md §8.3).
 *
 * One page edits ONE (顧客, 製品, 注文種別) entry: 基準単価（試算の見積単価、
 * 手動上書き可）+ 有効期間 + 状態 + quantity tiers（数量範囲 → ×倍率。単価 =
 * 基準単価 × 倍率、行ごとに手動上書き可）. The (顧客, 製品, 注文種別) keys are
 * the identity of the entry and are LOCKED after creation — only 基準単価 /
 * period / tiers are editable. 新規の価格表は試算の「価格表に登録」から作成する。
 *
 * TODO(server-action): replace the console.log submit with a Server Action.
 */

import {
  ActionIcon,
  Alert,
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
import { useTransition } from "react";
import { z } from "zod";
import { GhostButton } from "@/components/ui/buttons";
import { FieldValue } from "@/components/ui/FieldValue";
import { HelpLabel } from "@/components/ui/HelpLabel";
import { FormSection, FormShell } from "@/components/ui/shells";
import { zodResolver } from "@/lib/form";
import {
  CUSTOMERS,
  ORDER_TYPE_LABEL,
  ORDER_TYPE_OPTIONS,
  PRODUCTS,
} from "@/lib/mock";
import {
  entryKey,
  findEntriesByCustomerProduct,
  getPriceEntry,
  requiresEndDate,
} from "./mock";

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

const labelOf = (options: { value: string; label: string }[], value: string) =>
  options.find((o) => o.value === value)?.label ?? (value || "—");

function buildInitial(args: {
  mode: "create" | "edit";
  entryId?: string;
  lockedCustomerId?: string;
  lockedProductId?: string;
}): TypeFormValues {
  if (args.mode === "edit" && args.entryId) {
    const entry = getPriceEntry(args.entryId);
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
  entryId,
  lockedCustomerId,
  lockedProductId,
}: {
  mode: "create" | "edit";
  /** Edit: the (顧客, 製品, 注文種別) entry key. */
  entryId?: string;
  /** Create (種別を追加): lock 顧客/製品 to the existing 顧客×製品. */
  lockedCustomerId?: string;
  lockedProductId?: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // 顧客/製品 are locked when editing or adding a type to an existing group.
  const lockCustomerProduct =
    mode === "edit" || Boolean(lockedCustomerId && lockedProductId);
  // 注文種別 is locked only when editing (it's part of the entry identity).
  const lockType = mode === "edit";

  const form = useForm<TypeFormValues>({
    validate: zodResolver(schema),
    initialValues: buildInitial({
      mode,
      entryId,
      lockedCustomerId,
      lockedProductId,
    }),
  });

  const handleSubmit = (values: TypeFormValues) => {
    startTransition(() => {
      // TODO(server-action): persist this (顧客, 製品, 注文種別) entry + tiers.
      console.log("submit price-type", values);
      notifications.show({
        title: "保存しました",
        message:
          mode === "edit" ? "価格表を更新しました" : "価格表を作成しました",
        color: "green",
      });
      // 作成・更新後は対象エントリの詳細（ビュー）ページへ。
      const targetId =
        mode === "edit" && entryId
          ? entryId
          : entryKey(values.customerId, values.productId, values.orderType);
      router.push(`${BASE_PATH}/${targetId}`);
    });
  };

  return (
    <FormShell
      breadcrumbs={[
        "販売",
        { label: "価格表", href: BASE_PATH },
        mode === "edit" ? "編集" : "新規作成",
      ]}
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
              value={labelOf(CUSTOMERS, form.values.customerId)}
            />
          ) : (
            <Select
              data={CUSTOMERS}
              label="顧客"
              placeholder="顧客を選択"
              searchable
              withAsterisk
              {...form.getInputProps("customerId")}
            />
          )}
          {lockCustomerProduct ? (
            <FieldValue
              label="製品"
              value={labelOf(PRODUCTS, form.values.productId)}
            />
          ) : (
            <Select
              data={PRODUCTS}
              label="製品"
              placeholder="製品を選択"
              searchable
              withAsterisk
              {...form.getInputProps("productId")}
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
          const existing = findEntriesByCustomerProduct(
            form.values.customerId,
            form.values.productId,
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
        description="試算の見積単価から登録された基準です。手動で上書きできます。各段階の単価 = 基準単価 × 倍率。"
        title="基準単価"
      >
        <NumberInput
          label={
            <HelpLabel
              help="試算の見積単価から登録された基準。手動で上書きできます。各数量帯の単価 = 基準単価 × 倍率。"
              label="基準単価"
            />
          }
          maw={260}
          min={0}
          prefix="¥"
          thousandSeparator=","
          withAsterisk
          {...form.getInputProps("baseUnitPrice")}
        />
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
        description="数量範囲ごとの倍率（×1.01 など）。単価 = 基準単価 × 倍率。必要な行だけ単価を手動上書きできます。すべて同じ有効期間が適用されます。"
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
              <Table.Th>
                <HelpLabel
                  help="倍率による自動計算を使わず、この数量帯だけ固定単価にする場合に入力。空欄で自動計算。"
                  label="単価（上書き）"
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
                  <Table.Td>
                    <NumberInput
                      min={0}
                      placeholder={`自動: ¥${autoPrice.toLocaleString("ja-JP")}`}
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
                  </Table.Td>
                  <Table.Td ta="right">
                    <Text className="tabular-nums" ff="mono" fw={600} size="sm">
                      ¥{effective.toLocaleString("ja-JP")}
                    </Text>
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
