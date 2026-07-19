"use client";

/**
 * SalesOrderForm — 注文請書 新規作成（一括作成）/ 編集 (PD01, design.md §8.3).
 *
 * 新規: ヘッダ（顧客 SearchSelect / 支店 / 顧客注文書番号 / 既定納期）+
 * 明細 1..N 行（製品 SearchSelect / 注文種別 / 数量 / 単価 / 行納期 / 備考）。
 * 単価は 顧客×製品×注文種別×数量 が揃うと価格表からサーバー解決
 * （actions.resolvePriceForLine）で自動入力される — 注文請書は顧客注文書との
 * 突き合わせ文書のため手動上書きも可（見積書と異なる）。
 * 保存は createSalesOrders が採番1回 + branch 1..N の行を一括作成し、
 * 先頭行の詳細ページへ遷移する。
 *
 * 編集: 1行分の明細フィールド + 顧客注文書番号のみ（下書き・未ロック時のみ、
 * ガードはサーバー側でも実施）。顧客・支店は作成後変更不可。
 */

import {
  ActionIcon,
  Box,
  Divider,
  Group,
  NumberInput,
  Select,
  SimpleGrid,
  Text,
  TextInput,
} from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";
import { IconCalendar, IconPlus, IconTrash } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useRef, useTransition } from "react";
import { z } from "zod";
import {
  searchCustomerOptions,
  searchProductOptions,
} from "@/app/(dashboard)/_shared/option-search";
import {
  createSalesOrders,
  resolvePriceForLine,
  updateSalesOrder,
} from "@/app/(dashboard)/production/sales-orders/actions";
import { GhostButton } from "@/components/ui/buttons";
import { FieldValue } from "@/components/ui/FieldValue";
import { CUSTOMER_F4, PRODUCT_F4 } from "@/components/ui/f4-presets";
import { SearchSelect } from "@/components/ui/SearchSelect";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { FormSection, FormShell } from "@/components/ui/shells";
import { ORDER_TYPE_OPTIONS } from "@/lib/enum-labels";
import { zodResolver } from "@/lib/form";
import { formatMoney } from "@/lib/format";
import type { Option } from "@/lib/mock";
import type { SalesOrder } from "./model";

const BASE_PATH = "/production/sales-orders";

const ORDER_TYPES = ["PRODUCTION", "TEST", "SAMPLE", "OTHER"] as const;
type OrderType = (typeof ORDER_TYPES)[number];

const lineSchema = z.object({
  rowId: z.string(),
  productId: z.string().min(1, "製品を選択してください"),
  productName: z.string(),
  orderType: z.enum(ORDER_TYPES),
  quantity: z.number().int().min(1, "1以上"),
  unitPrice: z.number().min(0, "0以上"),
  /** 価格表から自動解決された単価か（false = 手入力 / 価格表なし）。 */
  priceResolved: z.boolean(),
  /** 適用された価格表 tier のラベル（例: "1〜9本"）。 */
  priceLabel: z.string().nullable(),
  deliveryDate: z.string().nullable(),
  notes: z.string(),
});

const schema = z.object({
  customerId: z.string().min(1, "顧客を選択してください"),
  customerBranchId: z.string().nullable(),
  customerOrderRef: z.string(),
  deliveryDate: z.string().nullable(),
  lines: z.array(lineSchema).min(1, "明細を1件以上追加してください"),
});

type FormValues = z.infer<typeof schema>;
type LineForm = FormValues["lines"][number];

let rowSeq = 0;
const newRowId = () => `row-${++rowSeq}-${Date.now()}`;

const emptyLine = (): LineForm => ({
  rowId: newRowId(),
  productId: "",
  productName: "",
  orderType: "PRODUCTION",
  quantity: 1,
  unitPrice: 0,
  priceResolved: false,
  priceLabel: null,
  deliveryDate: null,
  notes: "",
});

function toFormValues(order: SalesOrder): FormValues {
  return {
    customerId: order.customerId,
    customerBranchId: order.customerBranchId,
    customerOrderRef: order.customerOrderRef ?? "",
    deliveryDate: null,
    lines: [
      {
        rowId: newRowId(),
        productId: order.productId,
        productName: order.productName,
        orderType: (ORDER_TYPES as readonly string[]).includes(order.orderType)
          ? (order.orderType as OrderType)
          : "PRODUCTION",
        quantity: order.quantity,
        unitPrice: order.unitPrice,
        priceResolved: false,
        priceLabel: null,
        deliveryDate: order.deliveryDate,
        notes: order.notes ?? "",
      },
    ],
  };
}

export function SalesOrderForm({
  mode,
  order,
  branchesByCustomer,
}: {
  mode: "create" | "edit";
  /** 編集時: 対象注文請書（サーバー取得の view-model）。 */
  order?: SalesOrder | null;
  /** 顧客 BP id → 支店 options（quotes と同じ親子 BP 参照）。 */
  branchesByCustomer: Record<string, Option[]>;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const orderId = mode === "edit" ? order?.id : undefined;

  const form = useForm<FormValues>({
    validate: zodResolver(schema),
    initialValues:
      mode === "edit" && order
        ? toFormValues(order)
        : {
            customerId: "",
            customerBranchId: null,
            customerOrderRef: "",
            deliveryDate: null,
            lines: [emptyLine()],
          },
  });

  const branches = branchesByCustomer[form.values.customerId] ?? [];

  // 価格解決の競合ガード — 行(rowId)ごとに最後の要求トークンのみ採用する。
  const resolveToken = useRef(0);
  const tokenByRow = useRef(new Map<string, number>());

  /**
   * 顧客×製品×注文種別×数量 が揃ったら価格表からサーバー解決して単価を
   * 自動入力する。応答時に行のキー項目が変わっていたら破棄（手入力優先）。
   */
  const requestResolve = (
    customerId: string,
    line: Pick<LineForm, "rowId" | "productId" | "orderType" | "quantity">,
  ) => {
    if (!customerId || !line.productId || line.quantity < 1) return;
    const token = ++resolveToken.current;
    tokenByRow.current.set(line.rowId, token);
    resolvePriceForLine(
      customerId,
      line.productId,
      line.orderType,
      line.quantity,
    ).then((r) => {
      if (tokenByRow.current.get(line.rowId) !== token) return;
      form.setValues((prev) => ({
        ...prev,
        lines: (prev.lines ?? []).map((ln) =>
          ln.rowId === line.rowId &&
          ln.productId === line.productId &&
          ln.orderType === line.orderType &&
          ln.quantity === line.quantity
            ? {
                ...ln,
                unitPrice: r?.unitPrice ?? ln.unitPrice,
                priceResolved: r != null,
                priceLabel: r?.tierLabel ?? null,
              }
            : ln,
        ),
      }));
    });
  };

  /** 行のキー項目（製品/種別/数量）変更 → 反映して再解決。 */
  const patchLineAndResolve = (ri: number, patch: Partial<LineForm>) => {
    const next = { ...form.values.lines[ri], ...patch };
    form.setFieldValue(`lines.${ri}`, next);
    requestResolve(form.values.customerId, next);
  };

  /** 単価の手動上書き — 以後この行の in-flight 解決は破棄する。 */
  const overrideUnitPrice = (ri: number, value: number) => {
    const line = form.values.lines[ri];
    tokenByRow.current.set(line.rowId, ++resolveToken.current);
    form.setFieldValue(`lines.${ri}`, {
      ...line,
      unitPrice: value,
      priceResolved: false,
      priceLabel: null,
    });
  };

  /** 顧客変更 → 支店リセット + 全行を新しい顧客の価格表で再解決。 */
  const onCustomerChange = (customerId: string) => {
    form.setFieldValue("customerId", customerId);
    form.setFieldValue("customerBranchId", null);
    for (const line of form.values.lines) {
      requestResolve(customerId, line);
    }
  };

  const total = form.values.lines.reduce(
    (sum, ln) => sum + ln.unitPrice * ln.quantity,
    0,
  );

  const handleSubmit = (values: FormValues) => {
    startTransition(async () => {
      const result =
        mode === "edit" && orderId
          ? await updateSalesOrder(orderId, {
              customerOrderRef: values.customerOrderRef || null,
              productId: values.lines[0].productId,
              orderType: values.lines[0].orderType,
              quantity: values.lines[0].quantity,
              unitPrice: values.lines[0].unitPrice,
              deliveryDate: values.lines[0].deliveryDate,
              notes: values.lines[0].notes || null,
            })
          : await createSalesOrders({
              customerBpId: values.customerId,
              customerBranchBpId: values.customerBranchId,
              customerOrderRef: values.customerOrderRef || null,
              deliveryDate: values.deliveryDate,
              lines: values.lines.map((ln) => ({
                productId: ln.productId,
                orderType: ln.orderType,
                quantity: ln.quantity,
                unitPrice: ln.unitPrice,
                deliveryDate: ln.deliveryDate,
                notes: ln.notes || null,
              })),
            });
      if (result.ok) {
        notifications.show({
          title: "保存しました",
          message:
            mode === "edit"
              ? "注文請書を更新しました"
              : `注文請書を作成しました（${form.values.lines.length}件）`,
          color: "green",
        });
        // 作成後は先頭行（-01）の詳細ページへ。
        router.push(`${BASE_PATH}/${result.data.number}`);
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
        { label: "注文請書", href: BASE_PATH },
        mode === "edit" ? "編集" : "新規作成",
      ]}
      isDirty={form.isDirty()}
      isPending={isPending}
      onCancel={() =>
        router.push(orderId ? `${BASE_PATH}/${orderId}` : BASE_PATH)
      }
      onSubmit={form.onSubmit(handleSubmit)}
      status={
        mode === "edit" && order ? (
          <StatusBadge entity="SalesOrder" status={order.status} />
        ) : undefined
      }
      title={
        mode === "edit" ? `注文請書 編集 ${orderId ?? ""}` : "注文請書 新規作成"
      }
    >
      <FormSection title="基本情報">
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
          {mode === "create" ? (
            <>
              <SearchSelect
                error={form.errors.customerId}
                f4={CUSTOMER_F4}
                label="顧客"
                onChange={(v) => onCustomerChange(v ?? "")}
                onSearch={searchCustomerOptions}
                placeholder="顧客を検索"
                storageKey="customer"
                value={form.values.customerId || null}
                withAsterisk
              />
              {/* 支店 — quotes と同様、親子 BP（parent_id）から顧客ごとの options を渡す。 */}
              <Select
                clearable
                data={branches}
                disabled={branches.length === 0}
                label="支店"
                placeholder={branches.length ? "支店を選択" : "支店なし"}
                {...form.getInputProps("customerBranchId")}
              />
            </>
          ) : (
            <>
              {/* 顧客・支店は作成後変更不可（識別キー）。 */}
              <FieldValue label="顧客" value={order?.customerName} />
              <FieldValue label="支店" value={order?.customerBranchName} />
            </>
          )}
          <TextInput
            label="顧客注文書番号"
            placeholder="例: FAX受領の注文書番号"
            {...form.getInputProps("customerOrderRef")}
          />
          {mode === "create" && (
            <DatePickerInput
              clearable
              description="行納期が空の明細に適用されます"
              label="納期（既定）"
              leftSection={<IconCalendar size={14} />}
              placeholder="日付を選択"
              valueFormat="YYYY/MM/DD"
              {...form.getInputProps("deliveryDate")}
            />
          )}
        </SimpleGrid>
      </FormSection>

      <FormSection
        description="単価は 顧客×製品×注文種別×数量 が揃うと価格表から自動入力されます（手動上書き可）。保存時に明細ごとに注文請書番号 ORD-…-NN が採番されます。"
        title="明細"
      >
        <Group justify="flex-end" mb="xs">
          {typeof form.errors.lines === "string" && (
            <Text c="red" size="xs">
              {form.errors.lines}
            </Text>
          )}
        </Group>
        {form.values.lines.map((line, ri) => (
          <Box key={line.rowId}>
            {ri > 0 && <Divider my="md" />}
            <Group align="flex-end" gap="sm" wrap="nowrap">
              <Box flex={1}>
                <Group
                  align="flex-end"
                  gap="sm"
                  grow
                  preventGrowOverflow={false}
                >
                  <SearchSelect
                    error={form.errors[`lines.${ri}.productId`]}
                    f4={PRODUCT_F4}
                    initialOption={
                      line.productId
                        ? { value: line.productId, label: line.productName }
                        : null
                    }
                    label="製品"
                    onChange={(v, opt) =>
                      patchLineAndResolve(ri, {
                        productId: v ?? "",
                        productName: opt?.label ?? "",
                      })
                    }
                    onSearch={searchProductOptions}
                    placeholder="製品を検索"
                    storageKey="product"
                    value={line.productId || null}
                    withAsterisk
                  />
                  <Select
                    data={ORDER_TYPE_OPTIONS}
                    label="注文種別"
                    maw={140}
                    onChange={(v) =>
                      patchLineAndResolve(ri, {
                        orderType: (v ?? "PRODUCTION") as OrderType,
                      })
                    }
                    value={line.orderType}
                    withAsterisk
                  />
                  <NumberInput
                    error={form.errors[`lines.${ri}.quantity`]}
                    label="数量"
                    maw={110}
                    min={1}
                    onChange={(v) =>
                      patchLineAndResolve(ri, {
                        quantity: typeof v === "number" ? v : 0,
                      })
                    }
                    value={line.quantity}
                    withAsterisk
                  />
                  <NumberInput
                    decimalScale={2}
                    description={
                      line.priceResolved
                        ? `価格表 ${line.priceLabel ?? ""}`.trim()
                        : line.productId
                          ? "手入力（価格表未解決）"
                          : " "
                    }
                    error={form.errors[`lines.${ri}.unitPrice`]}
                    label="単価"
                    maw={160}
                    min={0}
                    onChange={(v) =>
                      overrideUnitPrice(ri, typeof v === "number" ? v : 0)
                    }
                    prefix="¥"
                    thousandSeparator=","
                    value={line.unitPrice}
                    withAsterisk
                  />
                </Group>
              </Box>
              {mode === "create" && (
                <ActionIcon
                  aria-label="明細を削除"
                  color="red"
                  disabled={form.values.lines.length <= 1}
                  mb={4}
                  onClick={() => form.removeListItem("lines", ri)}
                  variant="subtle"
                >
                  <IconTrash size={16} />
                </ActionIcon>
              )}
            </Group>
            <Group align="flex-end" gap="sm" mt="xs">
              <DatePickerInput
                clearable
                label="行納期"
                leftSection={<IconCalendar size={14} />}
                maw={200}
                placeholder={
                  mode === "create" ? "既定納期を使用" : "日付を選択"
                }
                valueFormat="YYYY/MM/DD"
                {...form.getInputProps(`lines.${ri}.deliveryDate`)}
              />
              <TextInput
                flex={1}
                label="備考"
                placeholder="行の備考（任意）"
                {...form.getInputProps(`lines.${ri}.notes`)}
              />
              <Text
                className="tabular-nums"
                ff="mono"
                fw={600}
                mb={8}
                size="sm"
                w={130}
              >
                {formatMoney(line.unitPrice * line.quantity)}
              </Text>
            </Group>
          </Box>
        ))}

        {mode === "create" && (
          <GhostButton
            leftSection={<IconPlus size={16} />}
            mt="md"
            onClick={() => form.insertListItem("lines", emptyLine())}
            size="xs"
          >
            明細を追加
          </GhostButton>
        )}

        <Divider my="md" />
        <Group justify="flex-end">
          <Text fw={700}>合計金額 {formatMoney(total)}</Text>
        </Group>
      </FormSection>
    </FormShell>
  );
}
